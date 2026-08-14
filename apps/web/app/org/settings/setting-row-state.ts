export type SettingValue = boolean | number | string | null;

/**
 * Whether a row has an unsaved change the owner actually made.
 *
 * A field with no organization default still needs something in its editor, so
 * the draft is pre-filled — which means the draft alone cannot distinguish
 * "we had to show something" from "they chose this". `touched` is what
 * separates them.
 *
 * The first version compared `orgValue ?? ''` against the pre-filled draft.
 * Every unset field therefore rendered as an unsaved change on arrival: the
 * scope chooser was open before anyone touched anything, and the first Save
 * button on the page belonged to a row nobody had edited. Clicking it pushed
 * that row's placeholder to every shop — a change the owner never asked for,
 * which is precisely what this page promises never to do.
 */
export function isDirty(touched: boolean, orgValue: SettingValue, draft: Exclude<SettingValue, null>): boolean {
  if (!touched) return false;
  // With no default yet, any explicit choice is a change — saving it is what
  // creates the default.
  if (orgValue === null) return true;
  return String(draft) !== String(orgValue);
}

/**
 * The value each shop is compared against when reporting drift: the pending
 * value once touched, otherwise the saved default. Null means there is no
 * organization default to compare to, so nothing is "differing" — the shops
 * simply each keep their own.
 */
export function driftTarget(touched: boolean, orgValue: SettingValue, draft: Exclude<SettingValue, null>): SettingValue {
  return touched ? draft : orgValue;
}

/** Shops whose current value differs from `target`. Empty when there is no target. */
export function shopsDiffering<T extends { settings: Record<string, SettingValue> }>(
  shops: readonly T[],
  key: string,
  target: SettingValue,
): T[] {
  if (target === null) return [];
  return shops.filter((shop) => String(shop.settings[key] ?? '') !== String(target));
}
