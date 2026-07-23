/**
 * Privacy-safe display labels for the public queue snapshot: a client's full
 * name is never exposed to an anonymous visitor. Reduces to first name +
 * enough of the last name to tell same-first-name people apart — e.g. two
 * "Jordan"s become "Jordan Le." / "Jordan Li." rather than both "Jordan L."
 * Guest entries (staff-typed labels like "Red Shirt") pass through as-is —
 * there's no real surname to redact.
 */
export interface WaitingNameInput {
  id: string;
  clientName: string | null;
  guestName: string | null;
}

export function disambiguateWaitingNames(entries: WaitingNameInput[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.clientName) {
      labels.set(entry.id, entry.guestName ?? 'Guest');
    }
  }

  const groups = new Map<string, { id: string; first: string; rest: string }[]>();
  for (const entry of entries) {
    if (!entry.clientName) continue;
    const parts = entry.clientName.trim().split(/\s+/);
    const first = parts[0] ?? entry.clientName;
    const rest = parts.slice(1).join(' ');
    const key = first.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push({ id: entry.id, first, rest });
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    if (list.length === 1) {
      const [{ id, first, rest }] = list;
      labels.set(id, rest ? `${first} ${rest[0].toUpperCase()}.` : first);
      continue;
    }

    const maxLen = Math.max(...list.map((person) => person.rest.length));
    let prefixLen = 1;
    while (prefixLen < maxLen) {
      const prefixes = list.map((person) => person.rest.slice(0, prefixLen).toLowerCase());
      if (new Set(prefixes).size === prefixes.length) break;
      prefixLen++;
    }

    for (const { id, first, rest } of list) {
      labels.set(id, rest ? `${first} ${rest.slice(0, prefixLen)}.` : first);
    }
  }

  return labels;
}
