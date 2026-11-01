import type { ServicesResponse, KillResult, FavoriteService } from './types';

const sessionKey = 'portwatch_session';
const incoming = new URLSearchParams(window.location.hash.slice(1)).get('token');
let sessionToken = incoming && /^[a-f\d]{64}$/.test(incoming) ? incoming : '';
try {
  if (sessionToken) sessionStorage.setItem(sessionKey, sessionToken);
  else sessionToken = sessionStorage.getItem(sessionKey) || '';
} catch { /* In-memory authentication still works when storage is disabled. */ }
if (incoming !== null) history.replaceState(null, '', window.location.pathname + window.location.search);

const messages: Record<string, [string, string]> = {
  UNAUTHORIZED: ['请重新打开终端中本次启动生成的完整会话链接。', 'Reopen the complete session URL printed by the current PortWatch process.'],
  STALE_PROCESS: ['进程已退出或发生变化，请刷新列表后重试。', 'The process has exited or changed. Refresh and try again.'],
  PROTECTED_PROCESS: ['此进程受保护，不能通过 PortWatch 停止。', 'This process is protected and cannot be stopped by PortWatch.'],
  PERMISSION_DENIED: ['没有权限停止此进程。', 'Permission denied while stopping this process.'],
  STILL_RUNNING: ['进程尚未退出。可等待后刷新，或单独确认强制停止。', 'The process is still running. Wait and refresh, or explicitly confirm Force stop.'],
  MISSING_TOOL: ['缺少 lsof 或 ps。Linux 请安装 lsof 和 procps。', 'Required tools are missing. Install lsof and procps (ps) on Linux.'],
  SCAN_FAILED: ['扫描失败或超时，请检查系统工具和权限。', 'The scan failed or timed out. Check system tools and permissions.'],
  DIRECTORY_UNAVAILABLE: ['目录已不存在或不在当前服务目录树中。', 'The directory is unavailable or is outside the current service tree.'],
  REVEAL_FAILED: ['无法打开目录，请确认已安装图形文件管理器。', 'Could not open the directory. A graphical file manager is required.'],
  TERMINAL_FAILED: ['无法打开终端，请确认已安装图形桌面及终端应用。', 'Could not open a terminal for this directory.'],
  FAVORITES_READ_FAILED: ['无法读取收藏文件，请检查文件权限或内容，已有文件不会被覆盖。', 'Could not read favorites. Check file permissions or contents; the existing file was preserved.'],
  FAVORITES_WRITE_FAILED: ['收藏未能保存到磁盘，请检查存储目录权限和剩余空间后重试。', 'Favorites could not be saved to disk. Check directory permissions and free space, then retry.'],
  FAVORITES_BUSY: ['另一个实例正在更新收藏，请稍后重试。', 'Another instance is updating favorites. Please retry shortly.'],
  ACTION_IN_PROGRESS: ['此进程正在停止，请稍候。', 'A stop operation is already in progress.'],
  REQUEST_FAILED: ['请求失败，请确认 PortWatch 仍在运行。', 'Request failed. Check that PortWatch is still running.'],
};
export function apiMessage(code: string): string {
  const pair = messages[code] || messages.REQUEST_FAILED;
  return pair[document.documentElement.lang.startsWith('zh') ? 0 : 1];
}

async function request<T>(route: string, init: RequestInit = {}): Promise<T> {
  if (!sessionToken) throw new Error(apiMessage('UNAUTHORIZED'));
  const res = await fetch(`/api${route}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${sessionToken}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionToken = '';
      try { sessionStorage.removeItem(sessionKey); } catch { /* optional storage */ }
    }
    throw new Error(apiMessage(data.code || 'REQUEST_FAILED'));
  }
  return res.json();
}

export function fetchServices(signal?: AbortSignal): Promise<ServicesResponse> {
  return request('/services', { signal });
}
export function fetchFavorites(signal?: AbortSignal): Promise<{ favorites: FavoriteService[] }> {
  return request('/favorites', { signal });
}
export function killService(serviceId: string, force = false): Promise<KillResult> {
  return request('/services/kill', { method: 'POST', body: JSON.stringify({ serviceId, force }) });
}
export function revealPath(targetPath: string): Promise<{ success: boolean }> {
  return request('/services/reveal', { method: 'POST', body: JSON.stringify({ targetPath }) });
}
export function openTerminalPath(targetPath: string): Promise<{ success: boolean }> {
  return request('/services/terminal', { method: 'POST', body: JSON.stringify({ targetPath }) });
}
export function addFavoriteService(serviceId: string): Promise<{ favorite: FavoriteService; favorites: FavoriteService[] }> {
  return request('/favorites', { method: 'POST', body: JSON.stringify({ serviceId }) });
}
export function removeFavoriteService(favoriteId: string): Promise<{ success: boolean; favorites: FavoriteService[] }> {
  return request(`/favorites/${favoriteId}`, { method: 'DELETE' });
}
