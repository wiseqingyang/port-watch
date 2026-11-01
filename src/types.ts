export type ServiceCategory =
  | 'frontend'      // ⚡ Web 前端 (Vite, Next.js, Astro, React, Vue, etc.)
  | 'backend'       // 🛠️ 后端服务 (Express, Nest, Spring Boot, FastAPI, Flask, Go, etc.)
  | 'ai_agent'      // 🤖 AI / Coding Agent / LLM 服务 (Ollama, vLLM, ComfyUI, FastMCP, Scratch, etc.)
  | 'database'      // 🗄️ 数据库 / 缓存 (Redis, MySQL, Postgres, MongoDB, etc.)
  | 'dev_tools'     // 🖥️ 开发工具 / 辅助软件 (workerd, Apifox, Docker, adb, etc.)
  | 'proxy_tunnel'  // 🌐 代理穿透 / 抓包 (Cloudflared, ngrok, clash, whistle, caddy, nginx, etc.)
  | 'system';       // 📦 系统服务 & 其他桌面软件 (ControlCenter, 微信等)

export interface PortService {
  /** Process ID plus a fingerprint of its owner and start time. */
  id: string;
  /** 监听端口列表（可能同一个进程在同一个服务上监听多个端口，如 8080 和 5885） */
  ports: number[];
  /** 主要端口（第一个端口） */
  port: number;
  /** 协议 */
  protocol: 'tcp' | 'udp';
  /** 绑定的监听地址 (127.0.0.1, 0.0.0.0, [::], etc.) */
  listenAddresses: string[];
  /** 进程 ID */
  pid: number;
  /** 父进程 ID */
  ppid: number;
  /** 可执行进程名 (e.g. node, python, java, ollama) */
  processName: string;
  /** 启动用户 */
  user: string;
  /** 工作目录 (CWD) */
  cwd: string | null;
  /** 项目信息 */
  project: {
    name: string;
    path: string;
    version?: string;
    description?: string;
  } | null;
  /** Display command with common credential patterns redacted. Never execute this string. */
  command: string;
  commandRedacted: boolean;
  /** 服务分类 */
  category: ServiceCategory;
  /** 识别出的具体框架或服务名 (e.g. "Vite", "Next.js", "Spring Boot", "Ollama", "Redis") */
  framework: string;
  /** 友好的服务标题 (例如 "demo-app (Vite)" 或 "Ollama Local LLM") */
  displayName: string;
  /** 是否属于开发 / Agent 服务 (用于前端快速一键聚焦过滤) */
  isDevOrAgent: boolean;
  /** CPU 百分比 */
  cpu: number;
  /** 物理内存 (MB) */
  memoryMb: number;
  /** 运行时间字符串 (e.g. "44d 0h", "12m 30s") */
  uptime: string;
  /** 进程已运行秒数 (用于精准时间排序) */
  uptimeSec: number;
  /** 不可关闭的原因提示（如为系统核心进程） */
  protectedReason?: string;
  /** 若该服务已收藏（或为离线收藏项），对应的收藏 ID */
  favoriteId?: string;
  /** 是否为当前未运行的离线收藏服务 */
  isOffline?: boolean;
  /** 最近一次扫描失败或尚未完成，不能确定当前运行状态 */
  runtimeUnknown?: boolean;
  /** 离线收藏服务上次在线时间戳 */
  lastSeenAt?: number;
  /** 工作目录在磁盘上是否依然存在 */
  cwdExists?: boolean;
}

export interface FavoriteService {
  /** 收藏项唯一标识 (基于 cwd + processName + framework + command 哈希生成) */
  favoriteId: string;
  /** 收藏创建时间 */
  createdAt: number;
  /** 最近一次监测到在线的时间戳 */
  lastSeenAt: number;
  /** 工作目录 (CWD) */
  cwd: string | null;
  /** 项目信息 */
  project: {
    name: string;
    path: string;
    version?: string;
    description?: string;
  } | null;
  /** 可执行进程名 */
  processName: string;
  /** 脱敏后的启动命令 */
  command: string;
  commandRedacted: boolean;
  /** 服务分类 */
  category: ServiceCategory;
  /** 识别出的具体框架或服务名 */
  framework: string;
  /** 友好的服务显示标题 */
  displayName: string;
  /** 是否属于开发 / Agent 服务 */
  isDevOrAgent: boolean;
  /** 上次监听的主要端口 */
  lastPort: number;
  /** 上次监听的所有端口列表 */
  lastPorts: number[];
  /** 协议 */
  protocol: 'tcp' | 'udp';
  /** 工作目录在磁盘上是否依然存在 */
  cwdExists?: boolean;
}

export interface SystemOverview {
  totalServices: number;
  totalPorts: number;
  devServicesCount: number;
  aiAgentCount: number;
  totalMemoryMb: number;
  categoryCounts: Record<ServiceCategory, number>;
  platform: string;
  hostname: string;
  timestamp: number;
}

export interface ServicesResponse {
  services: PortService[];
  overview: SystemOverview;
}

export interface KillResult {
  pid: number;
  success: boolean;
  code: 'STOPPED' | 'ALREADY_EXITED' | 'STILL_RUNNING';
}
