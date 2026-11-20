/**
 * The account screen in a build without accounts (docs/ACCOUNTS.md 8.2): it only says so. App.tsx loads this
 * instead of ./Account when no Firebase project is set, so such a build carries no account code at all.
 */
export function AccountOff() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="max-w-120">
        <h1 tabIndex={-1} className="t-title">
          Accounts are not set up yet
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-ink-2">Your progress is saved in this browser, on this device. You can keep playing as you are.</p>
        <a href="#/" className="btn btn-quiet -ml-4 mt-4">
          Back to home
        </a>
      </div>
    </div>
  );
}
