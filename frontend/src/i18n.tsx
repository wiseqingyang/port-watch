/* eslint-disable react/only-export-components -- Context, hooks, and translation helpers form one i18n module. */
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ServiceCategory } from './types';

export type Locale = 'zh' | 'en';

const translations = {
  zh: {
    appTitle: 'PortWatch - 端口与运行服务统一管理面板',
    navbar: {
      servicesCount: (n: number) => `${n} 个服务`,
      portsCount: (n: number) => `${n} 个监听端口`,
      devAgentCount: (n: number) => `开发/Agent: ${n}`,
      updatedAt: (time: string) => `${time} 更新`,
      pollLabel: '轮询:',
      pollAria: '自动刷新轮询频率',
      poll2s: '2 秒',
      poll4s: '4 秒',
      poll10s: '10 秒',
      pollPaused: '暂停',
      refreshTitle: '即时扫描端口',
      refreshBtn: '刷新',
      themeToLight: '切换为明亮浅色模式',
      themeToDark: '切换为护眼暗黑模式',
      langSwitchTitle: 'Switch to English',
    },
    categories: {
      all: '全部服务',
      frontend: '前端 Web',
      backend: '后端 API',
      ai_agent: 'AI / Agent',
      database: '数据库',
      dev_tools: '开发工具',
      proxy_tunnel: '网络代理',
      system: '系统进程',
    } as Record<'all' | ServiceCategory, string>,
    filter: {
      searchPlaceholder: '按端口、服务名称、命令、项目路径即时过滤 (如 :3000, vite, fastapi)...',
      treeViewTitle: '按工作目录树形展示（稳定视图）',
      treeView: '目录树形',
      flatViewTitle: '平铺列表展示',
      flatView: '平铺',
      favoritesBtn: '收藏',
      favoritesBtnTitle: '仅看已收藏的服务（包含当前未运行的历史服务）',
      devOnlyBtn: '开发/Agent',
      sortAria: '服务列表排序方式',
      sortDirAsc: '目录与名称 (A-Z · 最稳定)',
      sortUptimeDesc: '最近启动 (按时间排序)',
      sortPortAsc: '端口 (升序)',
      sortPortDesc: '端口 (降序)',
      sortMemoryDesc: '内存占用',
      sortNameAsc: '服务名称 (A-Z)',
    },
    list: {
      expandAll: '全部展开',
      collapseAll: '全部折叠',
      folderAndServiceSummary: (folders: number, services: number) =>
        `${folders} 个目录节点 · 共 ${services} 个服务`,
      metricsAndActions: '状态指标 / 快捷操作',
      flatHeaderLeft: '图标 · 类型 · 服务名称 · 端口',
      flatHeaderMiddle: '工作目录',
      flatHeaderRight: 'PID · 内存 · 运行时间 · 操作',
      emptyMatch: '暂无匹配的服务',
      rootDirLabel: '(系统根目录)',
      copyFullPath: '复制完整绝对路径',
      revealDir: '在文件管理器中打开此目录',
      openTerminalDir: '在终端中打开此目录',
      servicesUnit: (n: number) => `${n} 个服务`,
      openUrl: (port: number) => `访问 http://localhost:${port}`,
      copyPath: '复制路径',
      copyCmd: '复制启动命令',
      revealInFinder: '在文件管理器中定位',
      openInTerminal: '在终端中打开目录',
      favoriteAddTitle: '收藏此服务（电脑重启后也可找回）',
      favoriteRemoveTitle: '取消收藏',
      offlineBadge: '未检测到运行',
      unknownBadge: '运行状态未知',
      missingDirBadge: '目录不存在',
      lastPortLabel: (port: number) => `上次 :${port}`,
      uptimeTitle: (u: string) => `运行耗时: ${u}`,
      protectedTitle: (reason: string) => `受保护: ${reason}`,
      killTitle: '关闭服务',
      detailTitle: '查看详情',
      expandDirAria: '展开目录',
      collapseDirAria: '折叠目录',
    },
    detail: {
      ppidLabel: '父进程 PPID',
      userLabel: '用户',
      offlineSubtitle: '未检测到运行 · 已收藏历史服务快照',
      unknownSubtitle: '运行状态未知 · 无法确认当前监听状态',
      unknownFooterNote: '可打开目录查看项目；刷新成功后再确认服务运行状态。',
      unknownPortNote: (port: number) => `状态未知（上次监听端口 :${port}）`,
      portSection: '监听端口信息',
      openLocalhost: (port: number) => `打开 http://localhost:${port}`,
      offlinePortNote: (port: number) => `当前未监听（上次监听端口 :${port}）`,
      allPorts: '全部端口',
      memory: '内存占用',
      cpu: 'CPU 占比',
      uptime: '运行时间',
      cwd: '工作目录 (CWD)',
      missingCwdWarn: '该工作目录在磁盘上已不存在或已被移动',
      copy: '复制',
      reveal: '定位目录',
      openTerminal: '终端打开',
      favoriteAdd: '收藏服务',
      favoriteRemove: '已收藏',
      command: '命令行（常见凭据已脱敏）',
      redacted: '已隐藏凭据',
      protectedPrefix: '此进程受保护：',
      footerNote: '仅停止选中进程；自动重启暂不可用',
      offlineFooterNote: '可在终端打开工作目录并参考启动命令恢复运行',
      killBtn: '停止服务',
    },
    stop: {
      title: '确认停止进程', forceTitle: '进程仍在运行：强制停止？',
      warning: '将请求进程正常退出，可能中断活动连接。超时不会自动强制终止。',
      forceWarning: '强制停止会立即终止进程，可能丢失尚未保存的数据。',
      scope: '仅操作选中的进程，不关闭子进程或整个进程组。',
      cancel: '取消', confirm: '停止进程', forceConfirm: '确认强制停止', stopping: '正在停止…',
    },
    app: {
      scanning: '正在扫描本地监听端口与服务...',
      loadingFavorites: '正在读取收藏...',
      scanErrorPrefix: '扫描失败，运行状态未知：',
      favoritesErrorPrefix: '收藏读取失败：',
      emptyTitle: '未发现匹配的运行中服务',
      emptyFavoritesTitle: '暂无收藏的服务',
      emptyDescFavorites: '在服务列表右侧点击星标即可收藏常用服务。电脑意外关机或重启后，可在此直接找回项目目录与启动命令。',
      emptyDescDevOnly: '当前已开启“仅看开发/Agent服务”，若需查看系统所有监听端口，可关闭此过滤',
      emptyDescAll: '当前没有监听端口符合搜索或分类条件',
      viewAllPortsBtn: (n: number) => `查看全部监听端口 (${n})`,
      exitFavoritesBtn: '返回运行中服务',
      toastFetchError: '获取服务失败',
      toastKillSuccess: '服务已停止',
      toastKillSuccessDesc: (port: number, pid: number) => `进程 ${pid} 已退出（原监听端口 :${port}）`,
      toastKillError: '停止服务失败',
      toastRevealSuccess: '已在文件管理器中定位',
      toastRevealError: '打开目录失败',
      toastTerminalSuccess: '已在终端中打开目录',
      toastTerminalError: '打开终端失败',
      toastFavoriteAdded: '已添加到收藏',
      toastFavoriteRemoved: '已取消收藏',
      toastFavoriteError: '更新收藏失败',
    },
  },
  en: {
    appTitle: 'PortWatch - Local Port & Running Service Dashboard',
    navbar: {
      servicesCount: (n: number) => `${n} ${n === 1 ? 'Service' : 'Services'}`,
      portsCount: (n: number) => `${n} ${n === 1 ? 'Port' : 'Ports'}`,
      devAgentCount: (n: number) => `Dev/Agent: ${n}`,
      updatedAt: (time: string) => `Updated ${time}`,
      pollLabel: 'Poll:',
      pollAria: 'Auto-refresh polling interval',
      poll2s: '2s',
      poll4s: '4s',
      poll10s: '10s',
      pollPaused: 'Paused',
      refreshTitle: 'Scan ports now',
      refreshBtn: 'Refresh',
      themeToLight: 'Switch to Light Mode',
      themeToDark: 'Switch to Dark Mode',
      langSwitchTitle: '切换为简体中文',
    },
    categories: {
      all: 'All Services',
      frontend: 'Frontend',
      backend: 'Backend API',
      ai_agent: 'AI / Agent',
      database: 'Database',
      dev_tools: 'Dev Tools',
      proxy_tunnel: 'Proxy / Tunnel',
      system: 'System',
    } as Record<'all' | ServiceCategory, string>,
    filter: {
      searchPlaceholder: 'Filter by port, service name, command, or path (e.g. :3000, vite, fastapi)...',
      treeViewTitle: 'Group by working directory tree (Stable view)',
      treeView: 'Directory Tree',
      flatViewTitle: 'Flat list view',
      flatView: 'Flat List',
      favoritesBtn: 'Favorites',
      favoritesBtnTitle: 'Show favorited services only (including offline history)',
      devOnlyBtn: 'Dev / Agent',
      sortAria: 'Sort services by',
      sortDirAsc: 'Directory & Name (A-Z · Stable)',
      sortUptimeDesc: 'Recently Started (Uptime)',
      sortPortAsc: 'Port (Ascending)',
      sortPortDesc: 'Port (Descending)',
      sortMemoryDesc: 'Memory Usage',
      sortNameAsc: 'Service Name (A-Z)',
    },
    list: {
      expandAll: 'Expand All',
      collapseAll: 'Collapse All',
      folderAndServiceSummary: (folders: number, services: number) =>
        `${folders} folders · ${services} ${services === 1 ? 'service' : 'services'}`,
      metricsAndActions: 'Metrics / Quick Actions',
      flatHeaderLeft: 'Icon · Framework · Service Name · Port',
      flatHeaderMiddle: 'Working Directory',
      flatHeaderRight: 'PID · Memory · Uptime · Actions',
      emptyMatch: 'No matching services found',
      rootDirLabel: '(System Root)',
      copyFullPath: 'Copy full path',
      revealDir: 'Reveal directory in file manager',
      openTerminalDir: 'Open directory in Terminal',
      servicesUnit: (n: number) => `${n} ${n === 1 ? 'service' : 'services'}`,
      openUrl: (port: number) => `Open http://localhost:${port}`,
      copyPath: 'Copy path',
      copyCmd: 'Copy command',
      revealInFinder: 'Reveal in file manager',
      openInTerminal: 'Open in Terminal',
      favoriteAddTitle: 'Save to favorites (recover after reboot)',
      favoriteRemoveTitle: 'Remove from favorites',
      offlineBadge: 'Not detected',
      unknownBadge: 'Status unknown',
      missingDirBadge: 'Missing dir',
      lastPortLabel: (port: number) => `Last :${port}`,
      uptimeTitle: (u: string) => `Uptime: ${u}`,
      protectedTitle: (reason: string) => `Protected: ${reason}`,
      killTitle: 'Stop service',
      detailTitle: 'View details',
      expandDirAria: 'Expand folder',
      collapseDirAria: 'Collapse folder',
    },
    detail: {
      ppidLabel: 'PPID',
      userLabel: 'User',
      offlineSubtitle: 'Not detected · Saved favorite snapshot',
      unknownSubtitle: 'Status unknown · Current listeners could not be confirmed',
      unknownFooterNote: 'You can open the project directory. Refresh successfully to confirm its runtime status.',
      unknownPortNote: (port: number) => `Status unknown (last port :${port})`,
      portSection: 'Listening Ports',
      openLocalhost: (port: number) => `Open http://localhost:${port}`,
      offlinePortNote: (port: number) => `Not listening (last port :${port})`,
      allPorts: 'All Ports',
      memory: 'Memory',
      cpu: 'CPU Usage',
      uptime: 'Uptime',
      cwd: 'Working Directory (CWD)',
      missingCwdWarn: 'This working directory no longer exists on disk',
      copy: 'Copy',
      reveal: 'Reveal',
      openTerminal: 'Terminal',
      favoriteAdd: 'Favorite',
      favoriteRemove: 'Favorited',
      command: 'Command (common credentials redacted)',
      redacted: 'Credentials hidden',
      protectedPrefix: 'Protected process: ',
      footerNote: 'Stops only this process. Automatic restart is unavailable.',
      offlineFooterNote: 'Open the directory in Terminal and use the saved command to restart.',
      killBtn: 'Stop Service',
    },
    stop: {
      title: 'Stop this process?', forceTitle: 'Still running: force stop?',
      warning: 'Requests a graceful shutdown and may interrupt connections. It never escalates automatically.',
      forceWarning: 'Force stop terminates the process immediately and may lose unsaved data.',
      scope: 'Only the selected process is stopped. Children and process groups are not stopped.',
      cancel: 'Cancel', confirm: 'Stop process', forceConfirm: 'Confirm force stop', stopping: 'Stopping…',
    },
    app: {
      scanning: 'Scanning local listening ports and services...',
      loadingFavorites: 'Loading favorites...',
      scanErrorPrefix: 'Scan failed; runtime status is unknown: ',
      favoritesErrorPrefix: 'Could not load favorites: ',
      emptyTitle: 'No matching running services found',
      emptyFavoritesTitle: 'No favorite services yet',
      emptyDescFavorites: 'Click the star icon on any service to bookmark it. After an unexpected shutdown or reboot, you can quickly recover its directory and command here.',
      emptyDescDevOnly:
        '"Dev / Agent" filter is currently active. Turn it off to inspect all system listening ports.',
      emptyDescAll: 'No listening ports match your current search or category filter.',
      viewAllPortsBtn: (n: number) => `View All Listening Ports (${n})`,
      exitFavoritesBtn: 'Back to Running Services',
      toastFetchError: 'Failed to fetch services',
      toastKillSuccess: 'Service stopped',
      toastKillSuccessDesc: (port: number, pid: number) => `Process ${pid} has exited (previous port :${port})`,
      toastKillError: 'Failed to stop service',
      toastRevealSuccess: 'Revealed in file manager',
      toastRevealError: 'Failed to open directory',
      toastTerminalSuccess: 'Opened directory in Terminal',
      toastTerminalError: 'Failed to open Terminal',
      toastFavoriteAdded: 'Added to favorites',
      toastFavoriteRemoved: 'Removed from favorites',
      toastFavoriteError: 'Failed to update favorites',
    },
  },
};

/** 翻译后端分类器返回的中文内置服务名与保护原因 */
const DISPLAY_NAME_EN_MAP: Record<string, string> = {
  'Ollama 本地大模型服务': 'Ollama Local LLM',
  'ComfyUI 图像生成服务': 'ComfyUI Image Generation',
  'vLLM 本地推理服务': 'vLLM Inference Server',
  'Open WebUI 本地服务': 'Open WebUI Local Server',
  'Redis 缓存数据库': 'Redis Cache Server',
  'MySQL 关系型数据库': 'MySQL Database',
  'PostgreSQL 数据库': 'PostgreSQL Database',
  'MongoDB 文档数据库': 'MongoDB Database',
  'Elasticsearch 搜索引擎': 'Elasticsearch Engine',
  'Apifox 接口调试客户端': 'Apifox API Client',
  'Figma 本地字体/扩展服务': 'Figma Local Agent',
  'VS Code / Cursor 辅助进程': 'VS Code / Cursor Helper',
  'macOS AirPlay / 隔空播放': 'macOS AirPlay Receiver',
  '微信后台服务': 'WeChat Background Service',
};

const PROTECTED_REASONS: Record<string, [string, string]> = {
  SYSTEM_PROCESS: ['系统进程', 'System process'],
  PORTWATCH_PROCESS: ['PortWatch 或其父进程', 'PortWatch or its parent process'],
  OTHER_USER: ['其他用户的进程', 'Process owned by another user'],
  EXITED_PROCESS: ['进程正在退出', 'Process is exiting'],
};

export function localizeServiceDisplayName(name: string, locale: Locale): string {
  if (locale === 'zh') return name;
  if (DISPLAY_NAME_EN_MAP[name]) return DISPLAY_NAME_EN_MAP[name];
  return name
    .replace(/\(系统服务\)/g, '(System Service)')
    .replace(/\(端口 (\d+)\)/g, '(Port $1)');
}

export function localizeProtectedReason(reason: string | undefined, locale: Locale): string | undefined {
  if (!reason) return reason;
  return PROTECTED_REASONS[reason]?.[locale === 'zh' ? 0 : 1] || reason;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (loc: Locale) => void;
  toggleLocale: () => void;
  t: (typeof translations)['zh'];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const paramLang = params.get('lang');
      if (paramLang === 'en' || paramLang === 'zh') return paramLang;

      const saved = localStorage.getItem('portwatch_lang');
      if (saved === 'en' || saved === 'zh') return saved;

      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('zh')) return 'zh';
      return 'en';
    }
    return 'zh';
  });

  useEffect(() => {
    localStorage.setItem('portwatch_lang', locale);
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = translations[locale].appTitle;
  }, [locale]);

  const toggleLocale = () => {
    setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'));
  };

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        toggleLocale,
        t: translations[locale],
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
