/// <reference types="node" />
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runSystemCommand } from './system.js';
import { readProcesses, processIdentity, protectedReason } from './process-inspector.js';
import { redactCommand } from './redaction.js';
import { classifyService } from './classifier.js';
import type { PortService, SystemOverview, ServicesResponse, ServiceCategory } from './types.js';

// 缓存 package.json 信息，避免每次高频扫描重复读取磁盘
const projectMetaCache = new Map<string, { value: { name: string; path: string; version?: string } | null; expires: number }>();

/** 解析 ps 的 etime 为准确秒数 */
function parseElapsedToSeconds(etime: string): number {
  const trimmed = etime.trim();
  if (trimmed.includes('-')) {
    const [daysStr, timePart] = trimmed.split('-');
    const parts = (timePart || '').split(':');
    const days = Number.parseInt(daysStr, 10) || 0;
    const hours = Number.parseInt(parts[0] || '0', 10) || 0;
    const mins = Number.parseInt(parts[1] || '0', 10) || 0;
    const secs = Number.parseInt(parts[2] || '0', 10) || 0;
    return days * 86400 + hours * 3600 + mins * 60 + secs;
  }
  const parts = trimmed.split(':');
  if (parts.length === 3) {
    const hours = Number.parseInt(parts[0] || '0', 10) || 0;
    const mins = Number.parseInt(parts[1] || '0', 10) || 0;
    const secs = Number.parseInt(parts[2] || '0', 10) || 0;
    return hours * 3600 + mins * 60 + secs;
  }
  if (parts.length === 2) {
    const mins = Number.parseInt(parts[0] || '0', 10) || 0;
    const secs = Number.parseInt(parts[1] || '0', 10) || 0;
    return mins * 60 + secs;
  }
  return Number.parseInt(trimmed, 10) || 0;
}

function formatElapsed(etime: string): string {
  const sec = parseElapsedToSeconds(etime);
  if (sec >= 86400) return `${Math.floor(sec / 86400)}d ${Math.floor(sec % 86400 / 3600)}h`;
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor(sec % 3600 / 60)}m`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

/** Find the nearest project marker, with a bounded, short-lived cache. */
async function resolveProjectMeta(cwd: string | null): Promise<{ name: string; path: string; version?: string } | null> {
  if (!cwd || cwd === '/' || cwd.startsWith('/System/') || cwd.startsWith('/usr/')) return null;
  const cached = projectMetaCache.get(cwd);
  if (cached && cached.expires > Date.now()) return cached.value;
  let dir = cwd;
  let value: { name: string; path: string; version?: string } | null = null;
  for (let depth = 0; depth < 12 && dir !== path.dirname(dir); depth++, dir = path.dirname(dir)) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
      value = { name: typeof pkg.name === 'string' ? pkg.name : path.basename(dir), path: dir, version: typeof pkg.version === 'string' ? pkg.version : undefined };
    } catch {
      for (const marker of ['.git', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'requirements.txt']) {
        if (await fs.access(path.join(dir, marker)).then(() => true, () => false)) { value = { name: path.basename(dir), path: dir }; break; }
      }
    }
    if (value) break;
  }
  if (projectMetaCache.size >= 256) projectMetaCache.clear();
  projectMetaCache.set(cwd, { value, expires: Date.now() + 30_000 });
  return value;
}

interface RawPortRecord {
  pid: number;
  processName: string;
  host: string;
  port: number;
  protocol: 'tcp' | 'udp';
}

/** 执行 lsof 获取 Unix/macOS 的 LISTEN 端口 */
async function scanUnixPorts(): Promise<RawPortRecord[]> {
  const stdout = await runSystemCommand('lsof', ['-iTCP', '-sTCP:LISTEN', '-n', '-P', '-Fpcn'], true);

  const lines = stdout.split('\n');
  const records: RawPortRecord[] = [];
  let curPid: number | null = null;
  let curCmd = '';

  for (const line of lines) {
    if (!line) continue;
    const tag = line[0];
    const val = line.slice(1);

    if (tag === 'p') {
      curPid = Number.parseInt(val, 10);
    } else if (tag === 'c') {
      curCmd = val;
    } else if (tag === 'n' && curPid !== null) {
      const lastColon = val.lastIndexOf(':');
      if (lastColon !== -1) {
        const host = val.slice(0, lastColon);
        const port = Number.parseInt(val.slice(lastColon + 1), 10);
        if (!Number.isNaN(port) && port > 0) {
          records.push({
            pid: curPid,
            processName: curCmd,
            host,
            port,
            protocol: 'tcp',
          });
        }
      }
    }
  }
  return records;
}


/** 批量获取工作目录 CWD */
async function batchGetCwd(pids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (pids.length === 0) return map;

  const stdout = await runSystemCommand('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'], true);

  const lines = stdout.split('\n');
  let currentPid: number | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('p')) {
      currentPid = Number.parseInt(line.slice(1), 10);
    } else if (line.startsWith('n') && currentPid !== null) {
      map.set(currentPid, line.slice(1));
    }
  }
  return map;
}

/** 扫描所有服务 */
export async function scanRunningServices(): Promise<ServicesResponse> {
  const rawRecords = await scanUnixPorts();

  const pidGroups = new Map<number, {
    pid: number;
    processName: string;
    ports: Set<number>;
    hosts: Set<string>;
    protocols: Set<'tcp' | 'udp'>;
  }>();

  for (const record of rawRecords) {
    let group = pidGroups.get(record.pid);
    if (!group) {
      group = {
        pid: record.pid,
        processName: record.processName,
        ports: new Set(),
        hosts: new Set(),
        protocols: new Set(),
      };
      pidGroups.set(record.pid, group);
    }
    group.ports.add(record.port);
    group.hosts.add(record.host);
    group.protocols.add(record.protocol);
  }

  const pids = Array.from(pidGroups.keys());
  const [psInfoMap, cwdMap] = await Promise.all([
    readProcesses(pids),
    batchGetCwd(pids),
  ]);

  const services: PortService[] = [];

  for (const [pid, group] of pidGroups) {
    const psInfo = psInfoMap.get(pid);
    if (!psInfo || psInfo.state.startsWith('Z')) continue;
    const cwd = cwdMap.get(pid) || null;
    const command = psInfo?.command || group.processName;
    const sortedPorts = Array.from(group.ports).sort((a, b) => a - b);
    const primaryPort = sortedPorts[0] || 0;

    const projectMeta = await resolveProjectMeta(cwd);

    const classification = classifyService({
      pid,
      processName: group.processName,
      command,
      cwd,
      ports: sortedPorts,
      projectName: projectMeta?.name,
    });

    const displayCommand = redactCommand(command);
    const memoryMb = psInfo?.rssKb ? Math.round((psInfo.rssKb / 1024) * 10) / 10 : 0;

    services.push({
      id: processIdentity(psInfo),
      ports: sortedPorts,
      port: primaryPort,
      protocol: 'tcp',
      listenAddresses: Array.from(group.hosts),
      pid,
      ppid: psInfo?.ppid || 0,
      processName: group.processName,
      user: psInfo.user,
      cwd,
      project: projectMeta,
      command: displayCommand,
      commandRedacted: displayCommand !== command,
      category: classification.category,
      framework: classification.framework,
      displayName: classification.displayName,
      isDevOrAgent: classification.isDevOrAgent,
      cpu: psInfo?.cpu || 0,
      memoryMb,
      uptime: formatElapsed(psInfo.elapsed),
      uptimeSec: parseElapsedToSeconds(psInfo.elapsed),
      protectedReason: protectedReason(psInfo, group.processName),
    });
  }

  services.sort((a, b) => {
    if (a.isDevOrAgent && !b.isDevOrAgent) return -1;
    if (!a.isDevOrAgent && b.isDevOrAgent) return 1;
    return a.port - b.port;
  });

  const categoryCounts: Record<ServiceCategory, number> = {
    frontend: 0,
    backend: 0,
    ai_agent: 0,
    database: 0,
    dev_tools: 0,
    proxy_tunnel: 0,
    system: 0,
  };

  let totalMemoryMb = 0;
  let devServicesCount = 0;
  let aiAgentCount = 0;
  const uniquePortsSet = new Set<number>();

  for (const s of services) {
    categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    totalMemoryMb += s.memoryMb;
    if (s.isDevOrAgent) devServicesCount++;
    if (s.category === 'ai_agent') aiAgentCount++;
    for (const p of s.ports) {
      uniquePortsSet.add(p);
    }
  }

  const overview: SystemOverview = {
    totalServices: services.length,
    totalPorts: uniquePortsSet.size,
    devServicesCount,
    aiAgentCount,
    totalMemoryMb: Math.round(totalMemoryMb),
    categoryCounts,
    platform: os.platform(),
    hostname: os.hostname(),
    timestamp: Date.now(),
  };

  return {
    services,
    overview,
  };
}
