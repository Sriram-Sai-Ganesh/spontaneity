import type { BusyBlock } from "./availability";

interface FreeBusyResponse {
  calendars?: {
    [calendarId: string]: {
      busy?: Array<{ start: string; end: string }>;
      errors?: Array<{ domain: string; reason: string }>;
    };
  };
}

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
}

interface GoogleApiErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Exchange a Google refresh token for a new access token.
 * Returns null if the refresh fails (e.g. token was revoked).
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number } | null> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as TokenRefreshResponse;
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  return { accessToken: data.access_token, expiresAt };
}

/**
 * Fetch busy blocks for a user's primary Google Calendar over the given date range.
 * Returns null if the token is invalid or the calendar is inaccessible.
 */
export async function fetchGoogleFreeBusy(
  accessToken: string,
  dateRange: { start: string; end: string },
): Promise<{ busyBlocks: BusyBlock[] | null; reason?: string }> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: dateRange.start,
        timeMax: dateRange.end,
        items: [{ id: "primary" }],
      }),
    },
  );

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as GoogleApiErrorBody;
      const msg = body.error?.message;
      if (msg) detail = `${detail}: ${msg}`;
    } catch {
      // Ignore JSON parsing errors and keep coarse status detail.
    }
    return { busyBlocks: null, reason: `freebusy_request_failed (${detail})` };
  }

  const data = (await res.json()) as FreeBusyResponse;
  const primary = data.calendars?.primary;
  if (!primary) {
    return { busyBlocks: null, reason: "freebusy_missing_primary_calendar" };
  }
  if (primary.errors && primary.errors.length > 0) {
    const [firstError] = primary.errors;
    const errorDetail = [firstError?.domain, firstError?.reason]
      .filter(Boolean)
      .join(":");
    return {
      busyBlocks: null,
      reason: `freebusy_calendar_error${errorDetail ? ` (${errorDetail})` : ""}`,
    };
  }

  return { busyBlocks: (primary.busy ?? []) as BusyBlock[] };
}
