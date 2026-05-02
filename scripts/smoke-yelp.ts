import { searchNormalizedEvents } from "../convex/yelp";

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) throw new Error("Set YELP_API_KEY");

const events = await searchNormalizedEvents(apiKey, { city: "Baltimore", size: 5 });
console.log(JSON.stringify(events, null, 2));
