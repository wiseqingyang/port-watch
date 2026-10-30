import { version } from '../../../package.json';
import React from 'react';
import {
  RefreshCw,
  Sun,
  Moon,
  Languages,
} from 'lucide-react';
import type { SystemOverview } from '../types';
import { useI18n } from '../i18n';

interface NavbarProps {
  overview: SystemOverview | null;
  loading: boolean;
  onRefresh: () => void;
  autoRefreshInterval: number;
  onChangeAutoRefresh: (val: number) => void;
  lastUpdated: Date | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  overview,
  loading,
  onRefresh,
  autoRefreshInterval,
  onChangeAutoRefresh,
  lastUpdated,
  theme,
  onToggleTheme,
}) => {
  const { locale, toggleLocale, t } = useI18n();

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-850/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between gap-4">
        {/* 左侧：Logo 与指标数据 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/brand/mark.svg" alt="PortWatch" width={36} height={36} className="h-9 w-9 sm:hidden" />
            <img
              src={`/brand/logo-${theme}.svg`}
              alt="PortWatch"
              width={149}
              height={36}
              className="hidden h-9 w-auto shrink-0 sm:block"
            />
            <span className="hidden sm:inline text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-100 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400">
              v{version}
            </span>
          </div>

          {/* 紧凑 inline 统计摘要 */}
          {overview && (
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-zinc-200 dark:border-zinc-800 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>{t.navbar.servicesCount(overview.totalServices)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                <span>{t.navbar.portsCount(overview.totalPorts)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                <span>{t.navbar.devAgentCount(overview.devServicesCount)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：刷新、轮询频率、语言切换与明暗主题切换 */}
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="hidden lg:inline text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
              {t.navbar.updatedAt(lastUpdated.toLocaleTimeString())}
            </span>
          )}

          {/* 自动轮询频率下拉 */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">{t.navbar.pollLabel}</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => onChangeAutoRefresh(Number(e.target.value))}
              aria-label={t.navbar.pollAria}
              className="bg-transparent text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value={2000} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">{t.navbar.poll2s}</option>
              <option value={4000} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">{t.navbar.poll4s}</option>
              <option value={10000} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">{t.navbar.poll10s}</option>
              <option value={0} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">{t.navbar.pollPaused}</option>
            </select>
          </div>

          {/* 手动即时刷新按钮 */}
          <button
            onClick={onRefresh}
            disabled={loading}
            title={t.navbar.refreshTitle}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                loading ? 'animate-spin text-emerald-500' : 'text-zinc-400'
              }`}
            />
            <span className="hidden sm:inline">{t.navbar.refreshBtn}</span>
          </button>

          {/* 语言切换按钮 (中 / EN) */}
          <button
            onClick={toggleLocale}
            title={t.navbar.langSwitchTitle}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 text-zinc-400" />
            <span>{locale === 'zh' ? 'EN' : '中'}</span>
          </button>

          {/* 明暗主题切换按钮 */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.navbar.themeToLight : t.navbar.themeToDark}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-zinc-600" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
