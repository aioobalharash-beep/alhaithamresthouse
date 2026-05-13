// Occupancy caps per stay type.
//
// • Overnight: 6 sleeping spots in the chalet.
// • Day use / Event: 16 — the property can host a gathering during the day
//   even though it only sleeps 6.
//
// Used by the booking form (dropdown range), the admin walk-in form, and
// any place that needs to clamp / label the limit.

export type StayType = 'day_use' | 'night_stay' | 'event';

export const MAX_GUESTS_OVERNIGHT = 6;
export const MAX_GUESTS_DAY = 16;

export function maxGuestsFor(stayType: StayType): number {
  return stayType === 'night_stay' ? MAX_GUESTS_OVERNIGHT : MAX_GUESTS_DAY;
}

/** Clamp a guest count into the allowed range for the given stay type. */
export function clampGuestCount(count: number, stayType: StayType): number {
  const max = maxGuestsFor(stayType);
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(Math.max(1, Math.round(count)), max);
}
