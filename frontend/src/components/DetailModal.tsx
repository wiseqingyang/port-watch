import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Power,
  FolderOpen,
  Copy,
  Check,
  Cpu,
  Layers,
  Terminal,
  SquareTerminal,
  Star,
  Clock,
  Shield,
  Info,
  AlertTriangle,
} from 'lucide-react';
import type { PortService } from '../types';
import { CATEGORY_MAP } from '../utils/categoryMeta';
import {
  useI18n,
  localizeServiceDisplayName,
  localizeProtectedReason,
} from '../i18n';

interface DetailModalProps {
  service: PortService | null;
  isOpen: boolean;
  actionLoading: boolean;
  onClose: () => void;
  onRequestKill: (service: PortService, force?: boolean) => void;
  onRevealPath: (path: string) => void;
  onOpenTerminal: (path: string) => void;
  onToggleFavorite: (service: PortService) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  service,
  isOpen,
  actionLoading,
  onClose,
  onRequestKill,
  onRevealPath,
  onOpenTerminal,
  onToggleFavorite,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { locale, t } = useI18n();

  if (!isOpen || !service) return null;

  const unavailable = Boolean(service.isOffline || service.runtimeUnknown);
  const catMeta = CATEGORY_MAP[service.category] || CATEGORY_MAP.system;
  const catLabel = t.categories[service.category] || t.categories.system;
  const displayName = localizeServiceDisplayName(service.displayName, locale);
  const protectedReason = localizeProtectedReason(service.protectedReason, locale);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField(null);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl shadow-2xl overflow-hidden z-10 animate-slide-up flex flex-col max-h-[90vh]">
        {/* 头部标题与关闭按钮 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${unavailable ? 'bg-zinc-400' : catMeta.dotClass}`} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {displayName}
                </h3>
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${catMeta.badgeClass}`}>
                  {catLabel}
                </span>
                <span
                  className={`text-xs font-mono font-bold ${
                    unavailable
                      ? 'text-zinc-500 dark:text-zinc-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  :{service.port}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                {unavailable
                  ? (service.runtimeUnknown ? t.detail.unknownSubtitle : t.detail.offlineSubtitle)
                  : `PID ${service.pid} · ${t.detail.ppidLabel} ${service.ppid} · ${t.detail.userLabel} ${service.user}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onToggleFavorite(service)}
              disabled={Boolean(service.runtimeUnknown && !service.favoriteId)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                service.favoriteId
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  service.favoriteId ? 'fill-amber-400 text-amber-500' : ''
                }`}
              />
              <span>{service.favoriteId ? t.detail.favoriteRemove : t.detail.favoriteAdd}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 详情内容区域 */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          {/* 端口与网络 */}
          <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-850 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5 font-sans font-medium">
                <Layers className="w-3.5 h-3.5" />
                {t.detail.portSection}
              </span>
              {unavailable ? (
                <span className="text-zinc-400 dark:text-zinc-500 font-sans">
                  {service.runtimeUnknown ? t.detail.unknownPortNote(service.port) : t.detail.offlinePortNote(service.port)}
                </span>
              ) : (
                <a
                  href={`http://localhost:${service.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <span>{t.detail.openLocalhost(service.port)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="text-zinc-700 dark:text-zinc-300">
              {t.detail.allPorts}: {service.ports.map((p) => `:${p}`).join(', ')} ({service.protocol.toUpperCase()})
            </div>
          </div>

          {/* 运行指标（仅在线服务显示） */}
          {!unavailable && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-850 rounded-xl p-2.5">
                <div className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500 mb-1">
                  <Layers className="w-3 h-3" />
                  <span>{t.detail.memory}</span>
                </div>
                <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                  {service.memoryMb} MB
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-850 rounded-xl p-2.5">
                <div className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500 mb-1">
                  <Cpu className="w-3 h-3" />
                  <span>{t.detail.cpu}</span>
                </div>
                <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                  {service.cpu.toFixed(1)}%
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-850 rounded-xl p-2.5">
                <div className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500 mb-1">
                  <Clock className="w-3 h-3" />
                  <span>{t.detail.uptime}</span>
                </div>
                <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                  {service.uptime}
                </div>
              </div>
            </div>
          )}

          {/* 工作目录 CWD */}
          {service.cwd && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-sans font-medium">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t.detail.cwd}
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => handleCopy(service.cwd!, 'cwd')}
                    className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    {copiedField === 'cwd' ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{t.detail.copy}</span>
                  </button>
                  {service.cwdExists !== false && (
                    <>
                      <button
                        onClick={() => onRevealPath(service.cwd!)}
                        className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>{t.detail.reveal}</span>
                      </button>
                      <button
                        onClick={() => onOpenTerminal(service.cwd!)}
                        className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        <SquareTerminal className="w-3 h-3" />
                        <span>{t.detail.openTerminal}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-850 text-zinc-700 dark:text-zinc-300 break-all select-all">
                {service.cwd}
              </div>
              {service.cwdExists === false && (
                <div className="flex items-center gap-1.5 text-[11px] font-sans text-amber-600 dark:text-amber-400 pt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.detail.missingCwdWarn}</span>
                </div>
              )}
            </div>
          )}

          {/* 完整启动命令 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-sans font-medium">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                {t.detail.command}{service.commandRedacted ? ` · ${t.detail.redacted}` : ''}
              </span>
              <button
                onClick={() => handleCopy(service.command, 'cmd')}
                className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                {copiedField === 'cmd' ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{t.detail.copy}</span>
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-850 text-zinc-700 dark:text-zinc-300 break-all select-all text-[11px] leading-relaxed max-h-32 overflow-y-auto">
              {service.command}
            </div>
          </div>

          {/* 安全保护提示 */}
          {protectedReason && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              <Shield className="w-4 h-4 shrink-0" />
              <span className="font-sans">{t.detail.protectedPrefix}{protectedReason}</span>
            </div>
          )}
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-850">
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-sans flex items-center gap-1">
            <Info className="w-3 h-3 shrink-0" />
            <span>{service.runtimeUnknown ? t.detail.unknownFooterNote : unavailable ? t.detail.offlineFooterNote : t.detail.footerNote}</span>
          </div>

          {!unavailable && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onRequestKill(service, false);
                }}
                disabled={Boolean(service.protectedReason) || actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{t.detail.killBtn}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
