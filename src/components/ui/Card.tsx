import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'empty';
  padding?: 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', children, ...props }, ref) => {
    const baseStyles = 'bg-white border rounded-xl transition-all duration-200';
    const variants = {
      default: 'border-gray-200 shadow-sm',
      interactive: 'border-gray-200 shadow-sm cursor-pointer hover:border-forest-700 hover:shadow-md',
      empty: 'border-gray-200 border-dashed bg-cream',
    };
    const paddings = { sm: 'p-4', md: 'p-6', lg: 'p-8' };

    return (
      <div ref={ref} className={cn(baseStyles, variants[variant], paddings[padding], className)} {...props}>
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold text-gray-900', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';
