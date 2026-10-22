/** Whitespace-separated tokens matched in any order. */
export function matchesName(name: string, filter: string): boolean {
  const tokens = filter
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  const n = name.toLowerCase();
  return tokens.every((t) => n.includes(t));
}
