import React, { useId } from 'react';

/**
 * 语义化、键盘可滚动、带 caption 与吸顶表头的数据表格容器
 */
export default function DataTableShell({ caption, maxHeightClass = 'max-h-[62vh]', children }) {
  const captionId = useId();
  return (
    <div
      tabIndex={0}
      role="region"
      aria-labelledby={captionId}
      className={`table-region custom-scrollbar ${maxHeightClass}`}
    >
      <table className="text-xs text-slate-700">
        <caption id={captionId} className="visually-hidden">
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}
