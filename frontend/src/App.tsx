import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchServices,
  killService,
  apiMessage,
  revealPath,
} from './api';
import type { PortService, SystemOverview } from './types';
import { Navbar } from './components/Navbar';
import { FilterBar } from './components/FilterBar';
import { ServiceList } from './components/ServiceList';
import { StopModal } from './components/StopModal';
import { DetailModal } from './components/DetailModal';
import { Toast, type ToastMessage } from './components/Toast';
import { Terminal, Sparkles } from 'lucide-react';
import {
  type SortMode,
  type ViewMode,
  sortServicesList,
} from './utils/grouping';
import { useI18n } from './i18n';

export const App: React.FC = () => {
  const [services, setServices] = useState<PortService[]>([]);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 明暗主题切换支持 (默认深色，支持一键切换并持久化)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('portwatch_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: light)').matches
    ) {
      return 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('portwatch_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 筛选与展示状态
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [devOnly, setDevOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 视图模式 (目录树视图 vs 平铺列表，默认目录树)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('portwatch_view_mode');
    if (saved === 'tree' || saved === 'flat') return saved;
    return 'tree';
  });

  // 排序模式 (默认按目录字典序)
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem('portwatch_sort_mode');
    if (
      saved === 'dir-asc' ||
      saved === 'uptime-desc' ||
      saved === 'port-asc' ||
      saved === 'port-desc' ||
      saved === 'memory-desc' ||
      saved === 'name-asc'
    ) {
      return saved as SortMode;
    }
    return 'dir-asc';
  });

  useEffect(() => {
    localStorage.setItem('portwatch_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('portwatch_sort_mode', sortMode);
  }, [sortMode]);

  const [autoRefreshInterval, setAutoRefreshInterval] = useState(4000);
  const [actionLoading, setActionLoading] = useState(false);

  // 弹窗状态
  const [stopTarget, setStopTarget] = useState<{ service: PortService; force: boolean } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [detailTarget, setDetailTarget] = useState<PortService | null>(null);

  // 通知消息
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { t } = useI18n();

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Keep a single request in flight; pause automatic polling while the tab is hidden.
  const loadServices = useCallback(async (isSilent = false) => {
    if (isSilent && activeRequest.current) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (!isSilent) setLoading(true);
    try {
      const data = await fetchServices(controller.signal);
      if (controller.signal.aborted) return;
      setServices(data.services);
      setOverview(data.overview);
      setLastUpdated(new Date());
      setFetchError(null);
    } catch (err: unknown) {
      if (!controller.signal.aborted) setFetchError(err instanceof Error ? err.message : apiMessage('REQUEST_FAILED'));
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // The initial loading state is already true; avoid setting it again in the effect.
    const timer = setTimeout(() => void loadServices(true), 0);
    return () => { clearTimeout(timer); activeRequest.current?.abort(); activeRequest.current = null; };
  }, [loadServices]);

  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const refresh = () => { if (!document.hidden) void loadServices(true); };
    const visibility = () => {
      if (document.hidden) { activeRequest.current?.abort(); activeRequest.current = null; setLoading(false); }
      else refresh();
    };
    const timer = setInterval(refresh, autoRefreshInterval);
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [autoRefreshInterval, loadServices]);

  // 单个关闭服务
  const handleKill = async (service: PortService, force = false) => {
    setActionLoading(true);
    try {
      const res = await killService(service.id, force);
      if (res.success) {
        addToast(
          'success',
          t.app.toastKillSuccess,
          t.app.toastKillSuccessDesc(service.port, service.pid)
        );
        setStopTarget(null);
        await loadServices(true);
      } else {
        addToast('error', t.app.toastKillError, apiMessage(res.code));
        if (res.code === 'STILL_RUNNING') setStopTarget({ service, force: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast('error', t.app.toastKillError, message);
    } finally {
      setActionLoading(false);
    }
  };

  // 在访达中打开路径
  const handleRevealPath = async (path: string) => {
    try {
      const res = await revealPath(path);
      if (res.success) {
        addToast('info', t.app.toastRevealSuccess, path);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast('error', t.app.toastRevealError, message);
    }
  };

  // 过滤与排序后的服务列表
  const filteredServices = useMemo(() => {
    const list = services.filter((s) => {
      // 1. 开发服务专属模式过滤
      if (devOnly && !s.isDevOrAgent) {
        return false;
      }

      // 2. 分类过滤
      if (selectedCategory !== 'all' && s.category !== selectedCategory) {
        return false;
      }

      // 3. 搜索过滤
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchPort = String(s.port).includes(q) || s.ports.some((p) => String(p).includes(q));
        const matchName = s.displayName.toLowerCase().includes(q);
        const matchProcess = s.processName.toLowerCase().includes(q);
        const matchFramework = s.framework.toLowerCase().includes(q);
        const matchProject = s.project?.name.toLowerCase().includes(q);
        const matchCmd = s.command.toLowerCase().includes(q);
        const matchCwd = s.cwd?.toLowerCase().includes(q);

        if (
          !matchPort &&
          !matchName &&
          !matchProcess &&
          !matchFramework &&
          !matchProject &&
          !matchCmd &&
          !matchCwd
        ) {
          return false;
        }
      }

      return true;
    });

    return sortServicesList([...list], sortMode);
  }, [services, devOnly, selectedCategory, searchQuery, sortMode]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-600 dark:selection:text-emerald-400 transition-colors">
      {/* 顶部导航与紧凑指标 */}
      <Navbar
        overview={overview}
        loading={loading}
        onRefresh={() => loadServices(false)}
        autoRefreshInterval={autoRefreshInterval}
        onChangeAutoRefresh={setAutoRefreshInterval}
        lastUpdated={lastUpdated}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* 主体内容 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        {/* 筛选与搜索工具条 */}
        <FilterBar
          overview={overview}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          devOnly={devOnly}
          onToggleDevOnly={setDevOnly}
          searchQuery={searchQuery}
          onChangeSearch={setSearchQuery}
          sortMode={sortMode}
          onChangeSortMode={setSortMode}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
        />

        {fetchError && <div role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{fetchError}</div>}
        {/* 核心 List 列表区域 */}
        <div className="mt-4 pb-20">
          {loading && services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 dark:text-zinc-500">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs font-mono">{t.app.scanning}</p>
            </div>
          ) : fetchError && services.length === 0 ? null : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-850/80 rounded-2xl text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400 dark:text-zinc-500 mb-3">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                {t.app.emptyTitle}
              </h3>
              <p className="text-xs text-zinc-500 max-w-md mb-4 leading-relaxed">
                {devOnly ? t.app.emptyDescDevOnly : t.app.emptyDescAll}
              </p>
              {devOnly && (
                <button
                  onClick={() => setDevOnly(false)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-850 dark:hover:bg-zinc-800 dark:text-zinc-200 transition-colors shadow-2xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.app.viewAllPortsBtn(overview?.totalServices ?? 0)}</span>
                </button>
              )}
            </div>
          ) : (
            <ServiceList
              services={filteredServices}
              onRequestKill={(service) => setStopTarget({ service, force: false })}
              onOpenDetail={(s) => setDetailTarget(s)}
              onRevealPath={handleRevealPath}
              actionLoading={actionLoading || Boolean(fetchError)}
              viewMode={viewMode}
              sortMode={sortMode}
            />
          )}
        </div>
      </main>

      {stopTarget && (
        <StopModal service={stopTarget.service} force={stopTarget.force} loading={actionLoading}
          onClose={() => { if (!actionLoading) setStopTarget(null); }}
          onConfirm={() => void handleKill(stopTarget.service, stopTarget.force)} />
      )}

      {/* 进程详情弹窗 */}
      <DetailModal
        service={detailTarget}
        isOpen={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        onRequestKill={(service) => setStopTarget({ service, force: false })}
        onRevealPath={handleRevealPath}
        actionLoading={actionLoading || Boolean(fetchError)}
      />

      {/* 全局通知 Toast */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
