import { ConvexReactClient } from "convex/react";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

if (!CONVEX_URL) {
  throw new Error(
    "VITE_CONVEX_URL is not set. Run `npx convex dev` to configure.",
  );
}

export const CONVEX_SITE_URL = CONVEX_URL.replace(
  /\.cloud\//,
  ".site/",
).replace(/\.cloud$/, ".site");

export const convex = new ConvexReactClient(CONVEX_URL);
