/**
 * The one date format in the app: "Thu, Nov 19". The year is added only where a date may be kept,
 * like the teacher summary ("Thu, Nov 19, 2026").
 */
export function formatDate(d: Date | number = new Date(), withYear = false) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}
