import { createHash } from 'node:crypto';
import path from 'node:path';
import { runSystemCommand } from './system.js';

export interface ProcessInfo {
  pid: number;
  ppid: number;
  uid: number;
  user: string;
  cpu: number;
  rssKb: number;
  elapsed: string;
  startedAt: string;
  state: string;
  command: string;
}

export function parseProcessInfo(stdout: string): Map<number, ProcessInfo> {
  const result = new Map<number, ProcessInfo>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(\S+)\s+(.+)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    result.set(pid, { pid, ppid: Number(m[2]), uid: Number(m[3]), user: m[4], cpu: Number(m[5]), rssKb: Number(m[6]), elapsed: m[7], startedAt: m[8].replace(/\s+/g, ' '), state: m[9], command: m[10] });
  }
  return result;
}

export async function readProcesses(pids: number[]): Promise<Map<number, ProcessInfo>> {
  if (!pids.length) return new Map();
  const out = await runSystemCommand('ps', ['-ww', '-p', pids.join(','), '-o', 'pid=,ppid=,uid=,user=,pcpu=,rss=,etime=,lstart=,stat=,command='], true);
  return parseProcessInfo(out);
}

export function processIdentity(info: ProcessInfo): string {
  return `${info.pid}:${createHash('sha256').update(`${info.uid}:${info.startedAt}`).digest('hex').slice(0, 24)}`;
}

export function protectedReason(info: ProcessInfo, processName = ''): string | undefined {
  if (info.pid <= 1 || info.uid === 0) return 'SYSTEM_PROCESS';
  if (info.pid === process.pid || info.pid === process.ppid) return 'PORTWATCH_PROCESS';
  if (info.uid !== process.geteuid?.()) return 'OTHER_USER';
  // Protection is independent of the display classifier.
  const executable = path.basename(info.command.match(/^(?:"([^"]+)"|(\S+))/)?.slice(1).find(Boolean) || '').toLowerCase();
  if ([processName.toLowerCase(), executable].some(name => /^(launchd|systemd|controlcent|rapportd|windowserver|loginwindow|kernel_task)/.test(name))) return 'SYSTEM_PROCESS';
  if (info.state.startsWith('Z')) return 'EXITED_PROCESS';
  return undefined;
}
