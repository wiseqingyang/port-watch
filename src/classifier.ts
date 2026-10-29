import type { ServiceCategory } from './types.js';

interface ClassifierInput {
  pid: number;
  processName: string;
  command: string;
  cwd: string | null;
  ports: number[];
  projectName?: string | null;
}

interface ClassifierResult {
  category: ServiceCategory;
  framework: string;
  displayName: string;
  isDevOrAgent: boolean;
}

function detectPythonFramework(cmd: string): string {
  if (cmd.includes('fastapi') || cmd.includes('uvicorn')) return 'FastAPI';
  if (cmd.includes('flask')) return 'Flask';
  if (cmd.includes('django')) return 'Django';
  if (cmd.includes('tornado')) return 'Tornado';
  if (cmd.includes('gunicorn')) return 'Gunicorn';
  return 'Python API';
}

function detectNodeFramework(cmd: string): string {
  if (cmd.includes('nest')) return 'NestJS';
  if (cmd.includes('fastify')) return 'Fastify';
  if (cmd.includes('hono')) return 'Hono';
  if (cmd.includes('express')) return 'Express';
  if (cmd.includes('koa')) return 'Koa';
  return 'Node.js API';
}

function detectProxyName(proc: string): string {
  if (proc.includes('cloudflared')) return 'Cloudflare Tunnel';
  if (proc.includes('ngrok')) return 'Ngrok Tunnel';
  if (proc.includes('clash')) return 'Clash Proxy';
  if (proc.includes('nginx')) return 'Nginx';
  if (proc.includes('caddy')) return 'Caddy';
  if (proc.includes('whistle')) return 'Whistle';
  if (proc.includes('charles')) return 'Charles';
  return 'Proxy / Gateway';
}

export function classifyService(input: ClassifierInput): ClassifierResult {
  const { processName, command, cwd, ports, projectName } = input;
  // Match executable/module names, not arbitrary ancestor directory names.
  const lowerCmd = (command.toLowerCase().match(/"[^"]*"|'[^']*'|\S+/g) || [])
    .map(token => token.replace(/^["']|["']$/g, ''))
    .map(token => token.includes('/') ? token.slice(token.lastIndexOf('/') + 1) : token)
    .join(' ');
  const lowerProc = processName.toLowerCase();
  const primaryPort = ports[0] || 0;

  // 1. AI / Agent / LLM 辅助服务检测（高优先级）
  if (
    lowerCmd.includes('ollama') ||
    lowerProc === 'ollama'
  ) {
    return {
      category: 'ai_agent',
      framework: 'Ollama',
      displayName: 'Ollama 本地大模型服务',
      isDevOrAgent: true,
    };
  }

  if (
    /(?:^|\s)comfyui(?:\b|[._-])/.test(lowerCmd)
  ) {
    return {
      category: 'ai_agent',
      framework: 'ComfyUI',
      displayName: 'ComfyUI 图像生成服务',
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('vllm') || lowerCmd.includes('text-generation-webui')) {
    return {
      category: 'ai_agent',
      framework: 'vLLM / WebUI',
      displayName: 'vLLM 本地推理服务',
      isDevOrAgent: true,
    };
  }

  // 语言服务器 / LSP 辅助进程（优先提取，避免被工作目录中的 agent 等关键字覆盖）
  if (
    lowerProc.includes('language_server') ||
    lowerCmd.includes('language_server') ||
    lowerCmd.includes('language-server') ||
    lowerProc.includes('tsserver') || lowerCmd.includes('tsserver') ||
    lowerProc.includes('gopls') || lowerCmd.includes('gopls') ||
    lowerProc.includes('pyright') || lowerCmd.includes('pyright') ||
    lowerProc.includes('rust-analyzer') || lowerCmd.includes('rust-analyzer') ||
    (lowerProc.includes('clangd') || lowerCmd.includes('clangd'))
  ) {
    let lspName = 'Language Server (LSP)';
    if (lowerCmd.includes('tsserver') || lowerProc.includes('tsserver')) lspName = 'TypeScript Language Server';
    else if (lowerCmd.includes('pyright') || lowerProc.includes('pyright')) lspName = 'Pyright Language Server';
    else if (lowerCmd.includes('gopls') || lowerProc.includes('gopls')) lspName = 'Gopls Language Server';
    else if (lowerCmd.includes('rust-analyzer') || lowerProc.includes('rust-analyzer')) lspName = 'Rust Analyzer (LSP)';
    else if (lowerCmd.includes('clangd') || lowerProc.includes('clangd')) lspName = 'Clangd (LSP)';
    return {
      category: 'dev_tools',
      framework: 'LSP',
      displayName: lspName,
      isDevOrAgent: false,
    };
  }

  // Electron 桌面客户端 / GUI 窗口
  if (
    lowerProc === 'electron' ||
    lowerCmd.startsWith('electron ') ||
    lowerCmd.includes('/electron ') ||
    lowerCmd === 'electron .' ||
    lowerCmd.endsWith(' electron .')
  ) {
    return {
      category: 'frontend',
      framework: 'Electron',
      displayName: `${projectName || 'Desktop App'} (GUI)`,
      isDevOrAgent: true,
    };
  }

  // AI 智能体沙箱与独立原生二进制核心进程 (如 Antigravity, *-core, llm-* 等)
  if (lowerCmd.includes('antigravity') || lowerProc.includes('antigravity')) {
    return {
      category: 'ai_agent',
      framework: 'Antigravity',
      displayName: 'Antigravity (Agent Runtime)',
      isDevOrAgent: true,
    };
  }

  // 具体的 AI / Agent 命令行或中间件
  if (lowerCmd.includes('claude-code')) {
    return {
      category: 'ai_agent',
      framework: 'Claude Code',
      displayName: 'Claude Code CLI',
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('aider')) {
    return {
      category: 'ai_agent',
      framework: 'Aider',
      displayName: 'Aider AI Pair',
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('open-webui')) {
    return {
      category: 'ai_agent',
      framework: 'Open WebUI',
      displayName: 'Open WebUI 本地服务',
      isDevOrAgent: true,
    };
  }

  if (/(?:^|[\s.])(?:fastmcp|mcp)(?:$|[\s._-])/.test(lowerCmd)) {
    return {
      category: 'ai_agent',
      framework: 'MCP Server',
      displayName: `${projectName || 'MCP Server'}`,
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('langchain') || lowerCmd.includes('langgraph') || lowerCmd.includes('dify')) {
    return {
      category: 'ai_agent',
      framework: 'AI Workflow',
      displayName: `${projectName || 'Agent Service'}`,
      isDevOrAgent: true,
    };
  }

  if (
    lowerProc.startsWith('llm-') ||
    lowerCmd.includes('llm-') ||
    lowerProc.endsWith('-agent') ||
    lowerProc.includes('agent-core')
  ) {
    const isGenericRuntime = ['node', 'python', 'python3', 'java', 'bun', 'deno', 'ruby', 'sh', 'bash', 'zsh'].includes(lowerProc);
    return {
      category: 'ai_agent',
      framework: 'AI Core',
      displayName: isGenericRuntime ? `${projectName || processName}` : processName,
      isDevOrAgent: true,
    };
  }

  // 2. 前端 Web 开发服务器检测
  if (lowerCmd.includes('vite') || lowerCmd.includes('vite.js')) {
    const isPreview = lowerCmd.includes('preview');
    return {
      category: 'frontend',
      framework: isPreview ? 'Vite Preview' : 'Vite',
      displayName: projectName || 'Web App',
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('next dev') || lowerCmd.includes('next-server') || lowerCmd.includes('.next')) {
    return {
      category: 'frontend',
      framework: 'Next.js',
      displayName: projectName || 'Web App',
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('astro dev') || lowerCmd.includes('.bin/astro')) {
    return {
      category: 'frontend',
      framework: 'Astro',
      displayName: projectName || 'Web App',
      isDevOrAgent: true,
    };
  }

  if (lowerCmd.includes('nuxt dev') || lowerCmd.includes('.nuxt')) {
    return {
      category: 'frontend',
      framework: 'Nuxt',
      displayName: projectName || 'Web App',
      isDevOrAgent: true,
    };
  }

  if (
    lowerCmd.includes('react-scripts') ||
    lowerCmd.includes('webpack') ||
    lowerCmd.includes('webpack-dev-server') ||
    lowerCmd.includes('rspack') ||
    lowerCmd.includes('farm') ||
    lowerCmd.includes('umi') ||
    lowerCmd.includes('docusaurus') ||
    lowerCmd.includes('vue-cli') ||
    lowerCmd.includes('svelte-kit') ||
    lowerCmd.includes('remix dev')
  ) {
    let frameworkName = 'Webpack';
    if (lowerCmd.includes('react-scripts')) frameworkName = 'Create React App';
    else if (lowerCmd.includes('rspack')) frameworkName = 'Rspack';
    else if (lowerCmd.includes('farm')) frameworkName = 'Farm';
    else if (lowerCmd.includes('umi')) frameworkName = 'Umi';
    else if (lowerCmd.includes('docusaurus')) frameworkName = 'Docusaurus';
    else if (lowerCmd.includes('vue-cli')) frameworkName = 'Vue CLI';
    else if (lowerCmd.includes('svelte')) frameworkName = 'SvelteKit';
    else if (lowerCmd.includes('remix')) frameworkName = 'Remix';

    return {
      category: 'frontend',
      framework: frameworkName,
      displayName: `${projectName || 'Web App'} (${frameworkName})`,
      isDevOrAgent: true,
    };
  }

  if (
    lowerCmd.includes('http.server') ||
    lowerCmd.includes('http-server') ||
    lowerCmd.includes('live-server') ||
    lowerCmd.includes('serve ')
  ) {
    return {
      category: 'frontend',
      framework: 'Static Server',
      displayName: `${projectName || 'Static Files'} (HTTP Server)`,
      isDevOrAgent: true,
    };
  }

  // 3. 数据库 / 缓存
  if (lowerProc === 'redis-server' || lowerCmd.includes('redis-server')) {
    return {
      category: 'database',
      framework: 'Redis',
      displayName: 'Redis 缓存数据库',
      isDevOrAgent: false,
    };
  }

  if (lowerProc.includes('mysql')) {
    return {
      category: 'database',
      framework: 'MySQL',
      displayName: 'MySQL 关系型数据库',
      isDevOrAgent: false,
    };
  }

  if (lowerProc.includes('postgres')) {
    return {
      category: 'database',
      framework: 'PostgreSQL',
      displayName: 'PostgreSQL 数据库',
      isDevOrAgent: false,
    };
  }

  if (lowerProc.includes('mongod')) {
    return {
      category: 'database',
      framework: 'MongoDB',
      displayName: 'MongoDB 文档数据库',
      isDevOrAgent: false,
    };
  }

  if (lowerCmd.includes('elasticsearch')) {
    return {
      category: 'database',
      framework: 'Elasticsearch',
      displayName: 'Elasticsearch 搜索引擎',
      isDevOrAgent: false,
    };
  }

  // 4. 后端 API & 微服务
  if (
    lowerCmd.includes('spring-boot') ||
    lowerCmd.includes('springframework') ||
    lowerCmd.includes('mybatis') ||
    lowerCmd.includes('org.apache.tomcat') ||
    (lowerCmd.includes('application') && lowerProc.includes('java'))
  ) {
    return {
      category: 'backend',
      framework: 'Spring Boot',
      displayName: `${projectName || 'Java API'} (Spring Boot)`,
      isDevOrAgent: true,
    };
  }

  if (
    lowerCmd.includes('uvicorn') ||
    lowerCmd.includes('fastapi') ||
    lowerCmd.includes('gunicorn') ||
    lowerCmd.includes('flask') ||
    lowerCmd.includes('django') ||
    lowerCmd.includes('tornado')
  ) {
    const fw = detectPythonFramework(lowerCmd);
    return {
      category: 'backend',
      framework: fw,
      displayName: projectName || 'Python API',
      isDevOrAgent: true,
    };
  }

  if (
    lowerCmd.includes('express') ||
    lowerCmd.includes('nest') ||
    lowerCmd.includes('fastify') ||
    lowerCmd.includes('koa') ||
    lowerCmd.includes('hono') ||
    lowerCmd.includes('ts-node') ||
    lowerCmd.includes('nodemon')
  ) {
    const fw = detectNodeFramework(lowerCmd);
    return {
      category: 'backend',
      framework: fw,
      displayName: projectName || 'Node API',
      isDevOrAgent: true,
    };
  }

  if (lowerProc.includes('go') || lowerCmd.includes('go run')) {
    return {
      category: 'backend',
      framework: 'Go Server',
      displayName: projectName || 'Go Service',
      isDevOrAgent: true,
    };
  }

  // 5. 代理与网络穿透
  if (
    lowerProc.includes('cloudflared') ||
    lowerProc.includes('ngrok') ||
    lowerProc.includes('frpc') ||
    lowerProc.includes('frps') ||
    lowerProc.includes('clash') ||
    lowerProc.includes('whistle') ||
    lowerProc.includes('charles') ||
    lowerProc.includes('nginx') ||
    lowerProc.includes('caddy')
  ) {
    const name = detectProxyName(lowerProc);
    return {
      category: 'proxy_tunnel',
      framework: name,
      displayName: name,
      isDevOrAgent: false,
    };
  }

  // 6. 开发辅助工具与 Runtime
  if (lowerProc === 'workerd' || lowerCmd.includes('workerd')) {
    return {
      category: 'dev_tools',
      framework: 'Cloudflare Worker',
      displayName: `${projectName || 'Worker Runtime'} (workerd)`,
      isDevOrAgent: true,
    };
  }

  if (lowerProc.includes('apifox')) {
    return {
      category: 'dev_tools',
      framework: 'Apifox',
      displayName: 'Apifox 接口调试客户端',
      isDevOrAgent: false,
    };
  }

  if (lowerProc === 'adb') {
    return {
      category: 'dev_tools',
      framework: 'ADB',
      displayName: 'Android Debug Bridge (ADB)',
      isDevOrAgent: false,
    };
  }

  if (lowerProc.includes('figma')) {
    return {
      category: 'dev_tools',
      framework: 'Figma Agent',
      displayName: 'Figma 本地字体/扩展服务',
      isDevOrAgent: false,
    };
  }

  if (lowerProc.includes('code helper') || lowerProc.includes('cursor helper')) {
    return {
      category: 'dev_tools',
      framework: 'IDE Helper',
      displayName: 'VS Code / Cursor 辅助进程',
      isDevOrAgent: false,
    };
  }

  // 7. 系统或桌面软件底噪
  if (
    lowerProc.includes('rapportd') ||
    lowerProc.includes('controlcenter') ||
    lowerProc.includes('wechat') ||
    lowerProc.includes('wps') ||
    lowerProc.includes('launchd') ||
    lowerProc.includes('atrust')
  ) {
    let framework = 'System Service';
    let displayName = `${processName} (系统服务)`;
    if (lowerProc.includes('controlcenter')) {
      framework = 'AirPlay / ControlCenter';
      displayName = 'macOS AirPlay / 隔空播放';
    } else if (lowerProc.includes('wechat')) {
      framework = 'WeChat';
      displayName = '微信后台服务';
    }
    return {
      category: 'system',
      framework,
      displayName,
      isDevOrAgent: false,
    };
  }

  // 8. 兜底回退判断：根据 cwd 与命令模式
  const isUserProject =
    cwd &&
    !cwd.startsWith('/System') &&
    !cwd.startsWith('/usr') &&
    !cwd.startsWith('/Library') &&
    !cwd.includes('/Applications/');

  if (isUserProject && (lowerProc.includes('node') || lowerProc.includes('python') || lowerProc.includes('java') || lowerProc.includes('bun'))) {
    let type = 'Node.js App';
    if (lowerProc.includes('python')) type = 'Python App';
    else if (lowerProc.includes('java')) type = 'Java App';
    return {
      category: 'backend',
      framework: type,
      displayName: `${projectName || 'Dev Service'} (${type})`,
      isDevOrAgent: true,
    };
  }

  return {
    category: 'system',
    framework: processName,
    displayName: `${processName} (端口 ${primaryPort})`,
    isDevOrAgent: false,
  };
}
