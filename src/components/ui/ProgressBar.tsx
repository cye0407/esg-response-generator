import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  value: number;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({ value, className, showLabel = false, size = 'md' }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const sizes = { sm: 'h-2', md: 'h-3', lg: 'h-4' };

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('relative w-full bg-gray-200 rounded-full overflow-hidden', sizes[size])}>
        <div
          className="h-full progress-gradient rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 mt-1 block">{clampedValue}% complete</span>
      )}
    </div>
  );
}
