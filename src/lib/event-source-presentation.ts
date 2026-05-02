export function formatEventSourceLabel(source: string): string {
  if (source === "ticketmaster") return "Ticketmaster";
  if (source === "yelp") return "Yelp";

  return source
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatEventSourceLinkLabel(source: string): string {
  return `View on ${formatEventSourceLabel(source)}`;
}
