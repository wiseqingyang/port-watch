import React from 'react';
import { Search, Sparkles, SlidersHorizontal, X, FolderTree, List } from 'lucide-react';
import type { SystemOverview } from '../types.js';
import type { SortMode, ViewMode } from '../utils/grouping.js';
import { useI18n } from '../i18n.js';

export type { SortMode, ViewMode };

interface FilterBarProps {
  overview: SystemOverview | null;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  devOnly: boolean;
  onToggleDevOnly: (val: boolean) => void;
  searchQuery: string;
  onChangeSearch: (val: string) => void;
  sortMode: SortMode;
  onChangeSortMode: (mode: SortMode) => void;
  viewMode: ViewMode;
  onToggleViewMode: (mode: ViewMode) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  overview,
  selectedCategory,
  onSelectCategory,
  devOnly,
  onToggleDevOnly,
  searchQuery,
  onChangeSearch,
  sortMode,
  onChangeSortMode,
  viewMode,
  onToggleViewMode,
}) => {
  const { t } = useI18n();

  const categories = [
    { key: 'all', label: t.categories.all },
    { key: 'frontend', label: t.categories.frontend },
    { key: 'backend', label: t.categories.backend },
    { key: 'ai_agent', label: t.categories.ai_agent },
    { key: 'database', label: t.categories.database },
    { key: 'dev_tools', label: t.categories.dev_tools },
    { key: 'proxy_tunnel', label: t.categories.proxy_tunnel },
    { key: 'system', label: t.categories.system },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部行：搜索框、仅开发/Agent开关、视图切换、排序 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder={t.filter.searchPlaceholder}
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => onChangeSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 快捷开关、视图切换与排序 */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
          {/* 视图模式切换胶囊：目录树形 vs 平铺列表 */}
          <div className="flex items-center bg-zinc-100/90 dark:bg-zinc-900/80 p-0.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 text-xs">
            <button
              onClick={() => onToggleViewMode('tree')}
              title={t.filter.treeViewTitle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>{t.filter.treeView}</span>
            </button>
            <button
              onClick={() => onToggleViewMode('flat')}
              title={t.filter.flatViewTitle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'flat'
                  ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>{t.filter.flatView}</span>
            </button>
          </div>

          {/* 仅看开发/Agent服务专属开关 */}
          <button
            onClick={() => onToggleDevOnly(!devOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              devOnly
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-white dark:bg-zinc-950/70 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${
                devOnly ? 'text-emerald-500 fill-emerald-500/20' : 'text-zinc-400'
              }`}
            />
            <span>{t.filter.devOnlyBtn}</span>
            {overview && (
              <span className="text-[10px] font-mono opacity-80">
                ({overview.devServicesCount})
              </span>
            )}
          </button>

          {/* 排序方式下拉 */}
          <div className="flex items-center gap-1 bg-white dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 shadow-2xs">
            <SlidersHorizontal className="w-3 h-3 text-zinc-400 shrink-0" />
            <select
              value={sortMode}
              onChange={(e) => onChangeSortMode(e.target.value as SortMode)}
              aria-label={t.filter.sortAria}
              className="bg-transparent text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="dir-asc" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {t.filter.sortDirAsc}
              </option>
              <option value="uptime-desc" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {t.filter.sortUptimeDesc}
              </option>
              <option value="port-asc" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {t.filter.sortPortAsc}
              </option>
              <option value="port-desc" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {t.filter.sortPortDesc}
              </option>
              <option value="memory-desc" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {t.filter.sortMemoryDesc}
              </option>
              <option value="name-asc" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
                {t.filter.sortNameAsc}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* 底部行：平滑的分类 Segmented 标签胶囊 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none select-none">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          const count =
            cat.key === 'all'
              ? overview?.totalServices ?? 0
              : overview?.categoryCounts[cat.key as keyof typeof overview.categoryCounts] ?? 0;

          return (
            <button
              key={cat.key}
              onClick={() => onSelectCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-zinc-900 text-white dark:bg-zinc-800 dark:text-emerald-400 font-medium shadow-2xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/60'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                  isSelected
                    ? 'bg-zinc-800 text-zinc-300 dark:bg-zinc-700/80 dark:text-emerald-300'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
