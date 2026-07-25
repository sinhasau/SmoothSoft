/**
 * When a public profile lookup returns more than one person with the SAME name, we show a masked
 * phone number to let the customer pick the right profile — revealing only the last 4 digits, and
 * escalating one digit at a time until the numbers in that same-name group are distinguishable.
 * The full number is never sent to the client: only the masked string leaves the server.
 *
 * A profile whose name is unique in the result set gets no masked phone (its name is enough).
 */
export interface ProfileForDisambiguation {
  clientId: string;
  name: string;
  phoneDigits: string | null;
  suggestedServiceIds: string[];
}

export interface DisambiguatedProfile {
  clientId: string;
  name: string;
  maskedPhone: string | null;
  suggestedServiceIds: string[];
}

const MIN_REVEAL = 4;

/** Masks all but the last `reveal` digits with bullets, e.g. maskPhone('3135551234', 4) => '••••••1234'. */
export function maskPhone(digits: string, reveal: number): string {
  const show = Math.min(reveal, digits.length);
  const hidden = digits.length - show;
  return '•'.repeat(hidden) + digits.slice(digits.length - show);
}

/** Smallest trailing-digit count (at least 4) that makes every number in the group distinct. */
export function minimalUniqueReveal(digitsList: string[]): number {
  const maxLen = Math.max(0, ...digitsList.map((d) => d.length));
  let reveal = MIN_REVEAL;
  while (reveal < maxLen) {
    const suffixes = digitsList.map((d) => d.slice(-reveal));
    if (new Set(suffixes).size === suffixes.length) break;
    reveal += 1;
  }
  return reveal;
}

export function disambiguateProfiles(profiles: ProfileForDisambiguation[]): DisambiguatedProfile[] {
  const byName = new Map<string, ProfileForDisambiguation[]>();
  for (const profile of profiles) {
    const key = profile.name.trim().replace(/\s+/g, ' ').toLowerCase();
    const list = byName.get(key);
    if (list) list.push(profile);
    else byName.set(key, [profile]);
  }

  const maskedById = new Map<string, string | null>();
  for (const group of byName.values()) {
    if (group.length === 1) {
      maskedById.set(group[0].clientId, null); // unique name — no phone needed
      continue;
    }
    const reveal = minimalUniqueReveal(group.map((g) => g.phoneDigits).filter((d): d is string => !!d));
    for (const member of group) {
      maskedById.set(member.clientId, member.phoneDigits ? maskPhone(member.phoneDigits, reveal) : null);
    }
  }

  return profiles.map((profile) => ({
    clientId: profile.clientId,
    name: profile.name,
    maskedPhone: maskedById.get(profile.clientId) ?? null,
    suggestedServiceIds: profile.suggestedServiceIds,
  }));
}
