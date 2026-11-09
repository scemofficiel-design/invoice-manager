import type { ReactNode } from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = 'start', className }: { children: ReactNode; align?: 'start' | 'end'; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn('z-50 min-w-52 rounded-lg border border-border bg-surface p-1 shadow-xl', className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, className }: { children: ReactNode; onSelect?: () => void; className?: string }) {
  return (
    <M.Item onSelect={onSelect} className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted', className)}>
      {children}
    </M.Item>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-2.5 py-1.5 text-xs font-medium text-muted">{children}</M.Label>;
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
