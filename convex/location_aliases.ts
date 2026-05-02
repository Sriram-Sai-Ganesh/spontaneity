const PROVIDER_CITY_ALIASES: Record<string, string> = {
  dc: "Washington, D.C.",
  "d c": "Washington, D.C.",
  washingtondc: "Washington, D.C.",
  "washington dc": "Washington, D.C.",
  "washington d c": "Washington, D.C.",
  "washington district of columbia": "Washington, D.C.",
  sf: "San Francisco",
  "san fran": "San Francisco",
  nyc: "New York",
};

function cityAliasKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(d)\.(c)\./g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProviderCityLabel(
  city: string | null | undefined,
): string | undefined {
  const trimmed = city?.trim();
  if (!trimmed) return undefined;
  return PROVIDER_CITY_ALIASES[cityAliasKey(trimmed)] ?? trimmed;
}
