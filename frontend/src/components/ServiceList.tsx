import React, { useState, useMemo } from 'react';
import {
  ExternalLink,
  Power,
  FolderOpen,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Shield,
  FolderGit2,
  Folder,
  HardDrive,
  ChevronsUpDown,
  Globe,
  Server,
  Bot,
  Database,
  Terminal,
  SquareTerminal,
  Star,
  Radio,
  Cpu,
} from 'lucide-react';
import type { PortService } from '../types.js';
import { CATEGORY_MAP } from '../utils/categoryMeta.js';
import {
  buildFileSystemTree,
  getAllFolderNodes,
  type FileSystemTreeNode,
  type SortMode,
  type ViewMode,
} from '../utils/grouping.js';
import {
  useI18n,
  localizeServiceDisplayName,
  localizeProtectedReason,
  type Locale,
} from '../i18n.js';

interface ServiceListProps {
  services: PortService[];
  onRequestKill: (service: PortService, force?: boolean) => void;
  onOpenDetail: (service: PortService) => void;
  onRevealPath: (path: string) => void;
  onOpenTerminal: (path: string) => void;
  onToggleFavorite: (service: PortService) => void;
  actionLoading: boolean;
  viewMode: ViewMode;
  sortMode: SortMode;
}

/** 格式化清理冗长的完整命令路径，展示精简可读的执行命令 */
function formatCleanCommand(cmd: string): string {
  if (!cmd) return '';
  const trimmed = cmd.trim();
  const match = trimmed.match(/^("[^"]+"|\S+)\s*(.*)$/);
  if (!match) return trimmed;
  let bin = match[1].replace(/^"|"$/g, '');
  const args = match[2] || '';
  if (bin.includes('/')) {
    bin = bin.split('/').pop() || bin;
  }
  if (args) {
    const argParts = args.split(/\s+/);
    if (argParts.length > 0 && argParts[0].includes('/')) {
      const scriptName = argParts[0].split('/').pop() || argParts[0];
      return `${bin} ${scriptName} ${argParts.slice(1).join(' ')}`.trim();
    }
  }
  return `${bin} ${args}`.trim();
}

/** 获取进程所属类别的对应语义图标 */
function getCategoryIcon(category: string) {
  switch (category) {
    case 'frontend':
      return <Globe className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />;
    case 'backend':
      return <Server className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />;
    case 'ai_agent':
      return <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    case 'database':
      return <Database className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />;
    case 'dev_tools':
      return <Terminal className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300 shrink-0" />;
    case 'proxy_tunnel':
      return <Radio className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />;
    default:
      return <Cpu className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />;
  }
}

/** 获取精简清晰的技术框架/分类标签（名称） */
function getCleanFramework(framework: string, catLabel: string): string {
  if (!framework || framework === 'Custom' || framework === 'Unknown') {
    return catLabel;
  }
  if (framework === 'AI / Coding Agent') return 'AI Agent';
  if (framework.includes('Vite Preview')) return 'Vite Preview';
  return framework;
}

/** 获取纯净无冗余的服务名字（避免在名字中重复出现框架或后缀括号） */
function getCleanServiceDisplayName(service: PortService, locale: Locale): string {
  let name = localizeServiceDisplayName(service.displayName || '', locale);

  // 1. 如果有检测到的项目名称且当前名称为通用模板，优先使用项目名称
  if (
    service.project?.name &&
    (name.startsWith('AI Coding') ||
      name.startsWith('Web App') ||
      name.startsWith('API Service') ||
      name.startsWith('Python App') ||
      name.startsWith('Node.js App'))
  ) {
    name = service.project.name;
  }

  // 2. 如果名称仍为通用模板，尝试从 cwd 目录最末级提取有意义的项目名称
  if (
    service.cwd &&
    (name.startsWith('AI Coding') ||
      name.startsWith('Web App') ||
      name.startsWith('API Service') ||
      name === 'Electron App' ||
      name === 'Python App')
  ) {
    const segments = service.cwd.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last !== 'dist' && last !== 'build' && last !== 'src') {
      name = last;
    }
  }

  // 3. 去除名称尾部多余重复的括号框架后缀，如 "(Next.js)"、"(Vite)"、"(Agent 运行服务)" 等
  name = name
    .replace(/\s*\([^)]*Agent[^)]*\)/i, '')
    .replace(/\s*\([^)]*Next\.?js[^)]*\)/i, '')
    .replace(/\s*\([^)]*Vite[^)]*\)/i, '')
    .replace(/\s*\([^)]*FastAPI[^)]*\)/i, '')
    .replace(/\s*\([^)]*React[^)]*\)/i, '')
    .replace(/\s*\([^)]*Vue[^)]*\)/i, '')
    .replace(/\s*\([^)]*Express[^)]*\)/i, '')
    .replace(/\s*\([^)]*Python[^)]*\)/i, '')
    .trim();

  return name || service.processName;
}

export const ServiceList: React.FC<ServiceListProps> = ({
  services,
  onRequestKill,
  onOpenDetail,
  onRevealPath,
  onOpenTerminal,
  onToggleFavorite,
  actionLoading,
  viewMode,
  sortMode,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const { locale, t } = useI18n();

  // 构建类似真实操作系统文件管理系统的绝对根目录树形结构
  const fileSystemTree = useMemo(() => {
    if (viewMode !== 'tree') return null;
    return buildFileSystemTree(services, sortMode);
  }, [services, viewMode, sortMode]);

  // 获取树形结构中所有的文件夹节点
  const allFolderNodes = useMemo(() => {
    if (!fileSystemTree) return [];
    return getAllFolderNodes(fileSystemTree);
  }, [fileSystemTree]);

  const handleCopy = (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  // 折叠/展开单个目录路径
  const handleToggleCollapse = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // 一键全部展开 / 全部折叠（折叠子文件夹，保留根节点展开以便一览全局）
  const handleToggleCollapseAll = () => {
    if (collapsedPaths.size > 0) {
      setCollapsedPaths(new Set());
    } else {
      const subPaths = allFolderNodes.filter((n) => !n.isRoot).map((n) => n.fullPath);
      setCollapsedPaths(new Set(subPaths));
    }
  };

  // 渲染单个服务行条目
  const renderServiceRow = (
    service: PortService,
    nodeDepth = 0,
    isLastInGroup = false,
    isNestedInTree = true
  ) => {
    const unavailable = Boolean(service.isOffline || service.runtimeUnknown);
    const catMeta = CATEGORY_MAP[service.category] || CATEGORY_MAP.system;
    const catLabel = t.categories[service.category] || t.categories.system;
    const cleanFramework = getCleanFramework(service.framework, catLabel);
    const cleanDisplayName = getCleanServiceDisplayName(service, locale);
    const protectedReason = localizeProtectedReason(service.protectedReason, locale);

    return (
      <div
        key={service.id}
        onClick={() => onOpenDetail(service)}
        style={
          isNestedInTree
            ? { paddingLeft: `${nodeDepth * 22 + 48}px` }
            : undefined
        }
        className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-3 py-2.5 cursor-pointer transition-colors border-b border-zinc-200/50 dark:border-zinc-800/40 last:border-b-0 hover:bg-zinc-50/90 dark:hover:bg-zinc-900/40 ${
          isNestedInTree ? 'pr-4' : 'px-4'
        }`}
      >
        {/* 左侧：分类图标、框架标签、服务名称与监听端口 */}
        <div className="flex items-center gap-2 min-w-0 md:w-[48%] lg:w-[46%]">
          {/* 🌲 树形层级引导连接线：直接引向所属文件夹，呈现明确归属关系 */}
          {isNestedInTree && (
            <div className="relative w-4 h-6 shrink-0 self-center hidden sm:block pointer-events-none select-none">
              {/* 树干垂直线 */}
              <div
                className={`absolute left-0 top-0 w-px bg-zinc-300 dark:bg-zinc-700 ${
                  isLastInGroup ? 'h-1/2' : 'h-full'
                }`}
              />
              {/* 树枝水平横线 */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-px bg-zinc-300 dark:bg-zinc-700" />
            </div>
          )}

          {/* 1. icon：类别语义图标 */}
          <div className="shrink-0 p-1 rounded-md bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/50">
            {getCategoryIcon(service.category)}
          </div>

          {/* 2. 名称：技术框架或分类标签 */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 ${catMeta.badgeClass}`}
          >
            {cleanFramework}
          </span>

          {/* 3. 名字：服务主显示名字 */}
          <span
            className={`font-semibold text-xs truncate transition-colors ${
              unavailable
                ? 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
                : 'text-zinc-800 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-300'
            }`}
            title={cleanDisplayName}
          >
            {cleanDisplayName}
          </span>

          {/* 4. 端口：监听端口胶囊与外部访问快捷链接（或离线历史端口标识） */}
          {unavailable ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="bg-zinc-200/70 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-md font-mono font-semibold text-xs tracking-tight">
                :{service.port}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-200/60 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400">
                {service.runtimeUnknown ? t.list.unknownBadge : t.list.offlineBadge}
              </span>
              {service.cwdExists === false && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {t.list.missingDirBadge}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md font-mono font-semibold text-xs tracking-tight shrink-0">
              <span>:{service.port}</span>
              <a
                href={`http://localhost:${service.port}`}
                target="_blank"
                rel="noopener noreferrer"
                title={t.list.openUrl(service.port)}
                onClick={(e) => e.stopPropagation()}
                className="text-emerald-600/60 dark:text-emerald-400/60 hover:text-emerald-700 dark:hover:text-emerald-200 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* 中间列：启动命令或平铺模式下的工作目录 */}
        <div className="min-w-0 md:flex-1 pl-6 md:pl-0 flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-mono">
          {isNestedInTree ? (
            <span className="truncate max-w-[320px] text-[11px]" title={service.command}>
              {formatCleanCommand(service.command)}
            </span>
          ) : service.cwd ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="truncate text-zinc-600 dark:text-zinc-400 text-[11px]" title={service.cwd}>
                {service.cwd}
              </span>
              <button
                onClick={(e) => handleCopy(e, service.cwd!, `cwd-${service.id}`)}
                title={t.list.copyPath}
                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {copiedId === `cwd-${service.id}` ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
              {service.cwdExists !== false && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRevealPath(service.cwd!);
                    }}
                    title={t.list.revealInFinder}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-300 opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTerminal(service.cwd!);
                    }}
                    title={t.list.openInTerminal}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-300 opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <SquareTerminal className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <span className="truncate max-w-[280px] text-[11px]" title={service.command}>
              {formatCleanCommand(service.command)}
            </span>
          )}
        </div>

        {/* 右侧：运行指标与操作按钮 */}
        <div
          className="flex items-center justify-between md:justify-end gap-3 pl-6 md:pl-0 shrink-0 font-mono text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 运行指标 或 离线状态提示 */}
          {unavailable ? (
            <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 text-[11px]">
              <span>{t.list.lastPortLabel(service.port)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 text-[11px]">
              <span>PID {service.pid}</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span>{service.memoryMb}M</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span title={t.list.uptimeTitle(service.uptime)}>{service.uptime}</span>
            </div>
          )}

          {/* 快捷操作组 */}
          <div className="flex items-center gap-1">
            {/* 收藏 / 取消收藏星标按钮 */}
            <button
              onClick={() => onToggleFavorite(service)}
              disabled={Boolean(service.runtimeUnknown && !service.favoriteId)}
              title={service.favoriteId ? t.list.favoriteRemoveTitle : t.list.favoriteAddTitle}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                service.favoriteId
                  ? 'text-amber-500 hover:bg-amber-500/10'
                  : 'text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10 dark:text-zinc-500 dark:hover:text-amber-400'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  service.favoriteId ? 'fill-amber-400 text-amber-500' : ''
                }`}
              />
            </button>

            {unavailable ? (
              <>
                {/* 离线服务快捷复制启动命令 */}
                <button
                  onClick={(e) => handleCopy(e, service.command, `cmd-${service.id}`)}
                  title={t.list.copyCmd}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  {copiedId === `cmd-${service.id}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* 离线服务快捷定位目录与打开终端 */}
                {service.cwd && service.cwdExists !== false && (
                  <>
                    <button
                      onClick={() => onRevealPath(service.cwd!)}
                      title={t.list.revealInFinder}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-600 hover:bg-emerald-500/10 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onOpenTerminal(service.cwd!)}
                      title={t.list.openInTerminal}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-600 hover:bg-emerald-500/10 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      <SquareTerminal className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {/* 在线服务快捷打开终端 */}
                {service.cwd && (
                  <button
                    onClick={() => onOpenTerminal(service.cwd!)}
                    title={t.list.openInTerminal}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-600 hover:bg-emerald-500/10 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <SquareTerminal className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* 关闭服务按钮 */}
                <button
                  onClick={() => onRequestKill(service, false)}
                  disabled={Boolean(service.protectedReason) || actionLoading}
                  title={protectedReason ? t.list.protectedTitle(protectedReason) : t.list.killTitle}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-500/10 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  {service.protectedReason ? (
                    <Shield className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600" />
                  ) : (
                    <Power className="w-3.5 h-3.5" />
                  )}
                </button>
              </>
            )}

            {/* 详情箭头 */}
            <button
              onClick={() => onOpenDetail(service)}
              title={t.list.detailTitle}
              className="p-1 rounded text-zinc-300 dark:text-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染单个文件夹树节点（递归包含其子文件夹与直属服务）
  const renderTreeNode = (node: FileSystemTreeNode, isLastChild = false): React.ReactNode => {
    const isCollapsed = collapsedPaths.has(node.fullPath);

    // 解析压缩路径的前缀与末级叶节点名称
    let prefix = '';
    let leaf = node.name;
    if (!node.isRoot && node.name.includes('/')) {
      const lastSlash = node.name.lastIndexOf('/');
      prefix = node.name.slice(0, lastSlash + 1);
      leaf = node.name.slice(lastSlash + 1);
    }

    const hasExpandableContent = node.children.length > 0 || node.directServices.length > 0;

    return (
      <div key={node.id} className="transition-colors border-b border-zinc-200/80 dark:border-zinc-800/80 last:border-b-0">
        {/* 目录树节点头部行 */}
        <div
          onClick={() => handleToggleCollapse(node.fullPath)}
          style={{ paddingLeft: `${node.depth * 22 + 14}px` }}
          className={`group/header flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 pr-3.5 ${
            !isCollapsed && hasExpandableContent ? 'border-b border-zinc-200/50 dark:border-zinc-800/50' : ''
          } cursor-pointer select-none transition-colors ${
            node.isRoot
              ? 'bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200/60 dark:hover:bg-zinc-850/80'
              : 'bg-zinc-50/70 dark:bg-zinc-900/40 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/70'
          }`}
        >
          {/* 左侧：展开折叠箭头 + 目录图标 + 目录名称/压缩路径 + 项目标识 + 复制/打开 */}
          <div className="flex items-center gap-2 min-w-0">
            {/* 树枝分支连接折线（非根节点在屏幕适当时呈现） */}
            {node.depth > 0 && (
              <div className="relative w-3.5 h-5 shrink-0 self-center hidden sm:block pointer-events-none select-none">
                <div
                  className={`absolute left-0 top-0 w-px bg-zinc-300/80 dark:bg-zinc-700/70 ${
                    isLastChild ? 'h-1/2' : 'h-full'
                  }`}
                />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-px bg-zinc-300/80 dark:bg-zinc-700/70" />
              </div>
            )}

            {/* 展开/折叠箭头 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCollapse(node.fullPath);
              }}
              className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
              aria-label={isCollapsed ? t.list.expandDirAria : t.list.collapseDirAria}
            >
              {hasExpandableContent ? (
                isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )
              ) : (
                <div className="w-3.5 h-3.5" />
              )}
            </button>

            {/* 文件夹类型图标 */}
            <div className="shrink-0">
              {node.isRoot ? (
                <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : node.isProject ? (
                <FolderGit2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Folder className="w-4 h-4 text-amber-500/90 dark:text-amber-400/80" />
              )}
            </div>

            {/* 目录名称主显示：支持空文件夹多级压缩显示 (用 / 间隔) */}
            <div className="flex items-center gap-2 min-w-0" title={node.fullPath}>
              {node.isRoot ? (
                <div className="flex items-center font-mono text-xs">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">/</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-sans ml-1.5">
                    {t.list.rootDirLabel}
                  </span>
                </div>
              ) : (
                <div className="flex items-center font-mono text-xs truncate">
                  {prefix && (
                    <span className="text-zinc-400 dark:text-zinc-500 font-normal">
                      {prefix}
                    </span>
                  )}
                  <span className="text-zinc-900 dark:text-zinc-100 font-bold truncate">
                    {leaf}
                  </span>
                </div>
              )}

              {/* 检测到的项目名称 Badge */}
              {node.isProject && node.projectName && (
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-sans font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                  {node.projectName}
                </span>
              )}

              {/* 复制与打开绝对目录快捷操作 */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleCopy(e, node.fullPath, `path-${node.id}`)}
                  title={t.list.copyFullPath}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 opacity-60 group-hover/header:opacity-100 transition-all cursor-pointer"
                >
                  {copiedId === `path-${node.id}` ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevealPath(node.fullPath);
                  }}
                  title={t.list.revealDir}
                  className="p-1 rounded text-zinc-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 opacity-60 group-hover/header:opacity-100 transition-all cursor-pointer"
                >
                  <FolderOpen className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTerminal(node.fullPath);
                  }}
                  title={t.list.openTerminalDir}
                  className="p-1 rounded text-zinc-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 opacity-60 group-hover/header:opacity-100 transition-all cursor-pointer"
                >
                  <SquareTerminal className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：端口快速汇总胶囊 + 内存小计 + 服务数量 */}
          <div className="flex items-center gap-3 pl-8 sm:pl-0 shrink-0 font-mono text-xs">
            {/* 当前节点及其子树运行的端口列表 */}
            <div className="flex items-center gap-1 flex-wrap">
              {node.allPorts.slice(0, 4).map((p) => (
                <span
                  key={p}
                  className="px-1.5 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 text-[10px] text-zinc-700 dark:text-zinc-300 font-semibold"
                >
                  :{p}
                </span>
              ))}
              {node.allPorts.length > 4 && (
                <span className="text-[10px] text-zinc-400">
                  +{node.allPorts.length - 4}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              <span>{t.list.servicesUnit(node.totalServicesCount)}</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span>{node.totalMemoryMb} MB</span>
            </div>
          </div>
        </div>

        {/* 展开内容：递归渲染子目录与当前目录下的直属服务 */}
        {!isCollapsed && hasExpandableContent && (
          <div className="bg-zinc-50/20 dark:bg-zinc-950/25 divide-y-0">
            {/* 子目录节点 */}
            {node.children.map((child, index) =>
              renderTreeNode(
                child,
                index === node.children.length - 1 && node.directServices.length === 0
              )
            )}

            {/* 当前目录直属服务 */}
            {node.directServices.map((service, index) =>
              renderServiceRow(
                service,
                node.depth,
                index === node.directServices.length - 1,
                true
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-850/70 rounded-2xl shadow-sm overflow-hidden transition-colors">
      {/* 顶部工具栏：展开/折叠全部与列概览 */}
      {viewMode === 'tree' ? (
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50/70 dark:bg-zinc-900/40 border-b border-zinc-200/80 dark:border-zinc-850/60 text-xs text-zinc-500 dark:text-zinc-400 font-mono select-none">
          <div className="flex items-center gap-3">
            {/* 树形模式下提供全部展开/折叠操作 */}
            {allFolderNodes.length > 0 && (
              <button
                onClick={handleToggleCollapseAll}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                <span>{collapsedPaths.size > 0 ? t.list.expandAll : t.list.collapseAll}</span>
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-4 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>
              {t.list.folderAndServiceSummary(allFolderNodes.length, services.length)}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>{t.list.metricsAndActions}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-50/70 dark:bg-zinc-900/40 border-b border-zinc-200/80 dark:border-zinc-850/60 text-[11px] text-zinc-400 dark:text-zinc-500 font-mono select-none">
          {/* 左列：服务信息与监听端口 */}
          <div className="flex items-center gap-2 min-w-0 md:w-[48%] lg:w-[46%]">
            <span className="font-sans font-medium text-zinc-600 dark:text-zinc-400">
              {t.list.flatHeaderLeft}
            </span>
          </div>

          {/* 中列：项目工作目录绝对路径 */}
          <div className="hidden md:block min-w-0 flex-1">
            <span>{t.list.flatHeaderMiddle}</span>
          </div>

          {/* 右列：指标与操作 */}
          <div className="hidden md:block shrink-0 text-right">
            <span>{t.list.flatHeaderRight}</span>
          </div>
        </div>
      )}

      {/* 主体列表渲染 */}
      {viewMode === 'tree' ? (
        <div>
          {fileSystemTree ? (
            renderTreeNode(fileSystemTree)
          ) : (
            <div className="p-8 text-center text-zinc-400 text-sm">
              {t.list.emptyMatch}
            </div>
          )}
        </div>
      ) : (
        /* 平铺列表视图 */
        <div className="divide-y divide-zinc-100 dark:divide-zinc-850/50">
          {services.map((service) => renderServiceRow(service, 0, false, false))}
        </div>
      )}
    </div>
  );
};
