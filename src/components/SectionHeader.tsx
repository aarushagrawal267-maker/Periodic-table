import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The one way a section starts, on every screen: a title, an optional line under it,
 * and an optional quiet link or meta on the right. 16px below it the content begins.
 *
 * Phones: the link sits on the title's row (title left, link right) and the sub line spans the width under both.
 * From sm: title and sub line on the left, the link on the right aligned to the bottom of the block.
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
  const end = 'col-start-2 row-start-1 justify-self-end sm:row-span-2 sm:self-end';
  return (
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 sm:items-end">
      <Tag id={id} className="t-heading col-start-1 row-start-1 min-w-0">
        {title}
      </Tag>
      {sub && <p className="col-span-2 row-start-2 mt-1 max-w-2xl text-sm text-ink-2 sm:col-span-1 sm:col-start-1">{sub}</p>}
      {action && (
        <a href={action.href} className={`-my-3 inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink ${end}`}>
          {action.label} <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </a>
      )}
      {aside && <div className={end}>{aside}</div>}
    </div>
  );
}
