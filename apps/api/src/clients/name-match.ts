/**
 * Name matching for duplicate detection. Two names are "the same" when they match after
 * trimming, collapsing internal whitespace, and case-folding — so "John Smith", "john  smith",
 * and " John Smith " all collide, but "John Smith" and "John Smith Jr" do not. Used to block a
 * second profile with the exact same name on the same phone number (a true duplicate), while
 * still allowing a household to add differently-named people on one line.
 */
export function normalizeNameForMatch(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findExactNameMatch<T extends { name: string }>(existing: T[], candidateName: string): T | null {
  const target = normalizeNameForMatch(candidateName);
  if (!target) return null;
  return existing.find((entry) => normalizeNameForMatch(entry.name) === target) ?? null;
}
