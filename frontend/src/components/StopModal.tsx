import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { PortService } from '../types';
import { useI18n } from '../i18n';
import { Power, X } from 'lucide-react';

interface Props {
  service: PortService;
  force: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function StopModal({ service, force, loading, onConfirm, onClose }: Props) {
  const { t } = useI18n();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    cancel.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !loading) { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" onKeyDown={handleKeys} aria-modal="true" aria-labelledby="stop-title">
      <div className="fixed inset-0 bg-black/60" onClick={loading ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="stop-title" className="font-semibold">{force ? t.stop.forceTitle : t.stop.title}</h2>
          <button onClick={onClose} disabled={loading} aria-label={t.stop.cancel}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm break-all">{service.displayName} · PID {service.pid}</p>
        <p className="mt-3 text-xs text-zinc-500">{force ? t.stop.forceWarning : t.stop.warning}</p>
        <p className="mt-2 text-xs text-zinc-500">{t.stop.scope}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button ref={cancel} disabled={loading} onClick={onClose} className="px-3 py-2 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800">{t.stop.cancel}</button>
          <button disabled={loading} onClick={onConfirm} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-red-600 text-white disabled:opacity-50">
            <Power className="w-3.5 h-3.5" />{loading ? t.stop.stopping : force ? t.stop.forceConfirm : t.stop.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
