import type { PortService, ServicesResponse } from '../src/types.js';
import type { ProcessInfo } from '../src/process-inspector.js';
import { processIdentity } from '../src/process-inspector.js';

export const info: ProcessInfo = {
  pid: 12345, ppid: 2, uid: process.geteuid?.() || 501, user: 'developer', cpu: 0.5, rssKb: 1024,
  elapsed: '01:03', startedAt: 'Thu Oct 29 12:00:00 2026', state: 'S', command: 'node server.js',
};
export const service: PortService = {
  id: processIdentity(info), pid: info.pid, ppid: info.ppid, user: info.user, processName: 'node',
  port: 3000, ports: [3000], protocol: 'tcp', listenAddresses: ['127.0.0.1'], cwd: '/tmp/project', project: null,
  command: info.command, commandRedacted: false, category: 'backend', framework: 'Node.js', displayName: 'Test server',
  isDevOrAgent: true, cpu: 0.5, memoryMb: 1, uptime: '1m 3s', uptimeSec: 63,
};
export function response(services = [service]): ServicesResponse {
  return { services, overview: {
    totalServices: services.length, totalPorts: services.length, devServicesCount: services.length,
    aiAgentCount: 0, totalMemoryMb: 1, categoryCounts: { frontend: 0, backend: services.length, ai_agent: 0, database: 0, dev_tools: 0, proxy_tunnel: 0, system: 0 },
    platform: process.platform, hostname: 'test', timestamp: Date.now(),
  } };
}
