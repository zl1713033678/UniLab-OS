import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * 基于原生 <dialog> 的模态确认框：
 * - 使用 showModal() 获得原生顶层、inert 遮罩、Esc 取消与焦点恢复
 * - 默认将 autofocus 置于安全操作（取消按钮），防止回车误删
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认执行',
  cancelLabel = '取消',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.returnValue = '';
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close('');
    }
  }, [open]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const result = dialog.returnValue;
    dialog.returnValue = '';
    if (result === 'confirm') {
      onConfirm?.();
    } else {
      onCancel?.();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="closerequest"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={handleClose}
      onCancel={(e) => {
        e.preventDefault();
        dialogRef.current?.close('cancel');
      }}
      className="app-dialog w-full"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              tone === 'danger'
                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}
          >
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 id={titleId} className="text-sm font-bold text-slate-900">
                {title}
              </h2>
              <button
                type="button"
                aria-label="关闭确认框"
                onClick={() => dialogRef.current?.close('cancel')}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p id={descId} className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <form method="dialog" className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="submit"
            value="cancel"
            autoFocus
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            value="confirm"
            className={`px-4 py-2 rounded-lg text-white text-xs font-semibold shadow-sm transition ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </form>
      </div>
    </dialog>
  );
}
