import { CircleAlert } from 'lucide-react';

/**
 * The form-level error above a primary button: announced at once, red text with an icon. The live region
 * is always in the page (empty and zero height when there is nothing to say), so screen readers announce
 * a message the moment it appears. Spacing goes on the message (`className`), not on the region.
 */
export function FormError({ message, className = '' }: { message: string | null | undefined; className?: string }) {
  return (
    <div role="alert">
      {message ? (
        <p className={`flex gap-2 text-sm leading-5 text-bad ${className}`}>
          <CircleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
