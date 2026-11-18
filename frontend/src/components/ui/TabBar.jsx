import React, { useRef } from 'react';

/**
 * 符合 WAI-ARIA Tabs 规范的横向单行页签栏：
 * - 支持左右方向键、Home/End 切换焦点
 * - 选中状态通过下划线指示器 + aria-selected 表达，不依赖单纯颜色
 * - 窄屏下自动单行横向滚动并将激活标签滚入视野
 */
export default function TabBar({ label, tabs, activeId, onChange, trailing = null }) {
  const listRef = useRef(null);

  const handleKeyDown = (e, idx) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') nextIdx = 0;
    if (e.key === 'End') nextIdx = tabs.length - 1;
    const buttons = listRef.current?.querySelectorAll('[role="tab"]');
    const targetBtn = buttons?.[nextIdx];
    targetBtn?.focus();
    targetBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    onChange(tabs[nextIdx].id);
  };

  return (
    <div className="border-b border-slate-200 flex items-center justify-between gap-2 no-print">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="flex items-center gap-1 overflow-x-auto custom-scrollbar min-w-0"
      >
        {tabs.map((t, idx) => {
          const selected = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={(e) => {
                onChange(t.id);
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`modern-tab shrink-0 px-3.5 py-2 text-xs font-medium rounded-t-lg transition whitespace-nowrap ${
                selected
                  ? 'bg-white text-blue-700 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
