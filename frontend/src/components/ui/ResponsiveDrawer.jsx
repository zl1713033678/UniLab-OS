import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * 移动端 / 窄屏侧边导航抽屉（基于原生 <dialog> + scroll-snap + IntersectionObserver）
 */
export default function ResponsiveDrawer({ open, onClose, title = '功能菜单', children }) {
  const dialogRef = useRef(null);
  const scrollerRef = useRef(null);
  const sheetRef = useRef(null);

  const requestClose = () => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'auto' });
    } else {
      dialogRef.current?.close();
      onClose?.();
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !scroller || !sheet) return undefined;

    const visibleThreshold = 1 / Math.max(window.innerWidth, 320);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry && entry.intersectionRatio < visibleThreshold && dialog.open) {
          dialog.close();
          onClose?.();
        }
      },
      { root: dialog, threshold: [visibleThreshold, 1] }
    );
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !scroller) return;

    if (open && !dialog.open) {
      dialog.showModal();
      const openSeq = async () => {
        if (!CSS.supports('scroll-initial-target', 'nearest')) {
          scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'instant' });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        scroller.scrollTo({ left: 0, behavior: 'auto' });
      };
      openSeq();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className="nav-drawer"
      onClick={(e) => {
        if (sheetRef.current && !sheetRef.current.contains(e.target)) {
          requestClose();
        }
      }}
      onCancel={(e) => {
        if (e.cancelable) {
          e.preventDefault();
          requestClose();
        }
      }}
    >
      <div ref={scrollerRef} className="nav-drawer-scroller">
        <nav ref={sheetRef} aria-label="移动端主导航" className="nav-drawer-sheet p-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-2.5">
            <span className="font-bold text-sm text-slate-900">{title}</span>
            <button
              type="button"
              autoFocus
              aria-label="关闭导航菜单"
              onClick={requestClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          {children}
        </nav>
      </div>
    </dialog>
  );
}
