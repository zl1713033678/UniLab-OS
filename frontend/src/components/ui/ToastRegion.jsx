import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

/**
 * 基于 Top-Layer popover="manual" + aria-live 区域的可关闭悬浮通知
 * - 当用户悬停或键盘聚焦在通知内时暂停自动关闭
 * - 使用图标 + 文本 + 高对比度边框传递状态（不单纯依赖颜色）
 */
export default function ToastRegion({ notice, onClose }) {
  const layerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  const hasText = Boolean(notice?.text);

  useEffect(() => {
    const el = layerRef.current;
    if (!el || typeof el.showPopover !== 'function') return;
    try {
      if (hasText && !el.matches(':popover-open')) {
        el.showPopover();
      } else if (!hasText && el.matches(':popover-open')) {
        el.hidePopover();
      }
    } catch {
      // 忽略浏览器不支持或过渡期的状态异常
    }
  }, [hasText]);

  useEffect(() => {
    if (!hasText || paused) return undefined;
    const duration = notice.type === 'error' ? 7500 : 4500;
    const timer = window.setTimeout(() => {
      onClose?.();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [hasText, paused, notice?.text, notice?.type, onClose]);

  const isError = notice?.type === 'error';
  const isSuccess = notice?.type === 'success';
  const supportsPopover =
    typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

  return (
    <>
      {/* 集中式无障碍播报区：常驻 DOM，仅更新文本 */}
      <div
        className="visually-hidden"
        aria-live={isError ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {hasText ? `${isError ? '错误：' : isSuccess ? '成功：' : '提示：'}${notice.text}` : ''}
      </div>

      <div
        ref={layerRef}
        {...(supportsPopover ? { popover: 'manual' } : {})}
        role="region"
        aria-label="系统通知"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className={`toast-layer no-print ${
          supportsPopover ? '' : 'fixed bottom-5 right-4 z-50 max-w-md'
        } ${hasText ? 'block' : 'hidden'}`}
      >
        {hasText && (
          <div
            className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-xs backdrop-blur-sm ${
              isError
                ? 'bg-rose-50/95 border-rose-300 text-rose-900'
                : isSuccess
                ? 'bg-emerald-50/95 border-emerald-300 text-emerald-900'
                : 'bg-blue-50/95 border-blue-300 text-blue-900'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : isSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="flex-1 min-w-0 leading-relaxed font-medium break-words">
              {notice.text}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭通知"
              className="p-0.5 rounded text-slate-500 hover:text-slate-900 hover:bg-black/5 shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
