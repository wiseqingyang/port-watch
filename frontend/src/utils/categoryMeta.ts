import type { ServiceCategory } from '../types';

export interface CategoryMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
  borderClass: string;
  isDev: boolean;
}

export const CATEGORY_MAP: Record<ServiceCategory, CategoryMeta> = {
  frontend: {
    label: '前端 Web',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
    borderClass: 'border-emerald-500/20',
    isDev: true,
  },
  backend: {
    label: '后端 API',
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300',
    dotClass: 'bg-emerald-500',
    borderClass: 'border-zinc-200 dark:border-zinc-800',
    isDev: true,
  },
  ai_agent: {
    label: 'AI / Agent',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
    borderClass: 'border-emerald-500/20',
    isDev: true,
  },
  database: {
    label: '数据库',
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300',
    dotClass: 'bg-zinc-400 dark:bg-zinc-500',
    borderClass: 'border-zinc-200 dark:border-zinc-800',
    isDev: true,
  },
  dev_tools: {
    label: '开发工具',
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300',
    dotClass: 'bg-zinc-400 dark:bg-zinc-500',
    borderClass: 'border-zinc-200 dark:border-zinc-800',
    isDev: true,
  },
  proxy_tunnel: {
    label: '网络代理',
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300',
    dotClass: 'bg-zinc-400 dark:bg-zinc-500',
    borderClass: 'border-zinc-200 dark:border-zinc-800',
    isDev: false,
  },
  system: {
    label: '系统进程',
    badgeClass: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500',
    dotClass: 'bg-zinc-400 dark:bg-zinc-600',
    borderClass: 'border-zinc-200 dark:border-zinc-800',
    isDev: false,
  },
};
