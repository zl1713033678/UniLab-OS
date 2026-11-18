import React, { useId, useState } from 'react';

/**
 * 统一规范表单字段包装器：
 * - 自动生成唯一 id 并绑定 <label htmlFor>
 * - 将帮助提示（位于控件上方，避免遮挡自动填充弹出层）通过 aria-describedby 关联
 * - 失焦后检查 validity.valid 并同步 aria-invalid，避免初始加载即报错
 */
export function FormField({
  label,
  required = false,
  hint = '',
  errorText = '',
  className = '',
  children,
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const [hasError, setHasError] = useState(false);

  const describedBy = [hint ? hintId : null, hasError && errorText ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={fieldId} className="text-xs font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-rose-600 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <span id={hintId} className="text-[11px] text-slate-500 leading-snug">
          {hint}
        </span>
      )}
      {children({
        id: fieldId,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': hasError ? 'true' : 'false',
        onBlur: (e) => {
          if (e.target.validity) {
            setHasError(!e.target.validity.valid);
          }
        },
        onInput: (e) => {
          if (hasError && e.target.validity?.valid) {
            setHasError(false);
          }
        },
        onInvalid: () => setHasError(true),
      })}
      {hasError && errorText && (
        <span id={errorId} className="text-[11px] text-rose-600 font-medium">
          {errorText}
        </span>
      )}
    </div>
  );
}

export const INPUT_CLS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-500';
