import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The one way a section starts, on every screen: a title, an optional line under it,
 * and an optional quiet link on the right, all on one baseline. 16px below it the content begins.
 */
export function SectionHeader({
  id,
  title,
  sub,
  action,
  aside,
  as: Tag = 'h2',
}: {
  id?: string;
  title: ReactNode;
  sub?: ReactNode;
  action?: { href: string; label: string };
  aside?: ReactNode;
  as?: 'h1' | 'h2';
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <Tag id={id} className="t-heading">
          {title}
        </Tag>
        {sub && <p className="mt-1 max-w-2xl text-sm text-ink-2">{sub}</p>}
      </div>
      {action && (
        <a href={action.href} className="-my-3 inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink">
          {action.label} <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </a>
      )}
      {aside}
    </div>
  );
}
