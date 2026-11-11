import type { ComponentProps } from 'react';
import { forwardRef } from 'react';

import { cn } from '../lib/cn';
import { inputClass } from './input';

// 原生 <textarea>：resize 只允许纵向（横向拉伸会破坏栅格布局）。
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(inputClass, 'resize-y', className)}
        {...props}
      />
    );
  },
);
