import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, label, error, hint, id, rows = 4, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            'w-full px-3.5 py-2.5 text-sm border rounded-lg bg-white transition-colors duration-200 resize-none',
            'placeholder:text-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-forest-700/20 focus:border-forest-700',
            'disabled:bg-gray-50 disabled:cursor-not-allowed',
            error ? 'border-error' : 'border-gray-300',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
        {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';
