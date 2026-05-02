import { searchNormalizedEvents } from "../convex/ticketmaster";

const apiKey = process.env.TICKETMASTER_API_KEY;
if (!apiKey) throw new Error("Set TICKETMASTER_API_KEY");

const events = await searchNormalizedEvents(apiKey, { city: "Baltimore", size: 5 });
console.log(JSON.stringify(events, null, 2));
