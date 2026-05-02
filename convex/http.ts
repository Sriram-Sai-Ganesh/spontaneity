import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import chatApp from "./http_chat";

const http = httpRouter();

// ── Auth routes (required by @convex-dev/auth) ──────────────────
auth.addHttpRoutes(http);

// ── Chat API endpoint ───────────────────────────────────────────

const chatHandler = httpAction(async (ctx, request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Auth: extract userId from Bearer token
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  // Bind ctx and userId into Hono's env
  const env = { ctx, userId: userId as Id<"users"> };

  // Rewrite URL to match Hono's route pattern
  const url = new URL(request.url);
  url.pathname = "/api/chat";
  const rewritten = new Request(url.toString(), request);

  const response = await chatApp.fetch(rewritten, env);

  // Add CORS headers to the response
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

http.route({
  path: "/api/chat",
  method: "POST",
  handler: chatHandler,
});

http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: chatHandler,
});

// ── CORS helpers ────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL environment variable is required");

  // CORS headers must contain just the origin (protocol + host + port), not a path.
  // GitHub Pages project sites live at a subpath (e.g., /team-05), but the browser
  // sends Origin without that path. Using URL().origin keeps redirects using the
  // full SITE_URL while returning the correct Access-Control-Allow-Origin value.
  const allowOrigin = new URL(siteUrl).origin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default http;
