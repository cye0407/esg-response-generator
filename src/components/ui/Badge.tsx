import { cn } from '@/lib/utils';

export interface BadgeProps {
  variant?: 'default' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    info: 'bg-accent-light text-accent',
  };

  return (
    <span className={cn('inline-flex items-center gap-1 font-medium rounded px-2 py-1 text-xs', variants[variant], className)}>
      {children}
    </span>
  );
}
