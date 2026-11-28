/**
 * The account screen in a build without accounts (docs/ACCOUNTS.md 8.2): it only says so. App.tsx loads this
 * instead of ./Account when no Firebase project is set, so such a build carries no account code at all.
 */
export function AccountOff() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="max-w-120">
        <h1 tabIndex={-1} className="t-title">
          No account needed
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-ink-2">
          Periodica works without signing up. Your progress is saved in this browser, on this device, and nothing is sent anywhere. Open Progress to see how you are doing, or keep playing.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#/" className="btn btn-primary">
            Back to home
          </a>
          <a href="#/progress" className="btn btn-secondary">
            Your progress
          </a>
        </div>
      </div>
    </div>
  );
}
