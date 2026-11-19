/**
 * The one on/off switch. Off: a surface track and knob in --line-control (3:1 on every surface, so the control
 * and its state are findable at rest). On: the accent track with an --on-accent knob. Put it inside a <label> so the whole row is the touch target.
 */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color] duration-150 ease-out ${
        on ? 'border-accent bg-accent' : 'border-line-control bg-surface-2'
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-[3px] h-5 w-5 rounded-full transition-[background-color,transform] duration-150 ease-out ${
          on ? 'translate-x-[23px] bg-on-accent' : 'translate-x-[3px] bg-line-control'
        }`}
      />
    </button>
  );
}
