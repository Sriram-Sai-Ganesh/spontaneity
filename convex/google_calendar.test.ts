import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchGoogleFreeBusy, refreshGoogleAccessToken } from "./google_calendar";

const DATE_RANGE = {
  start: "2026-03-10T00:00:00Z",
  end: "2026-03-17T00:00:00Z",
};

describe("google_calendar", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalGoogleId: string | undefined;
  let originalGoogleSecret: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalGoogleId = process.env.AUTH_GOOGLE_ID;
    originalGoogleSecret = process.env.AUTH_GOOGLE_SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T00:00:00Z"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalGoogleId === undefined) delete process.env.AUTH_GOOGLE_ID;
    else process.env.AUTH_GOOGLE_ID = originalGoogleId;
    if (originalGoogleSecret === undefined) delete process.env.AUTH_GOOGLE_SECRET;
    else process.env.AUTH_GOOGLE_SECRET = originalGoogleSecret;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("refreshGoogleAccessToken returns null when auth env vars are missing", async () => {
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await refreshGoogleAccessToken("refresh-token");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("refreshGoogleAccessToken exchanges refresh token on success", async () => {
    process.env.AUTH_GOOGLE_ID = "client-id";
    process.env.AUTH_GOOGLE_SECRET = "client-secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await refreshGoogleAccessToken("refresh-token");

    expect(result).toEqual({
      accessToken: "new-access-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("refreshGoogleAccessToken returns null when token endpoint errors", async () => {
    process.env.AUTH_GOOGLE_ID = "client-id";
    process.env.AUTH_GOOGLE_SECRET = "client-secret";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("unauthorized", { status: 401 })) as typeof globalThis.fetch;

    const result = await refreshGoogleAccessToken("refresh-token");
    expect(result).toBeNull();
  });

  test("fetchGoogleFreeBusy returns busy blocks on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: [
                { start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" },
                { start: "2026-03-11T14:00:00Z", end: "2026-03-11T15:30:00Z" },
              ],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await fetchGoogleFreeBusy("access-token", DATE_RANGE);

    expect(result).toEqual({
      busyBlocks: [
        { start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" },
        { start: "2026-03-11T14:00:00Z", end: "2026-03-11T15:30:00Z" },
      ],
    });
  });

  test("fetchGoogleFreeBusy returns reason when Google responds with HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Calendar API disabled" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    ) as typeof globalThis.fetch;

    const result = await fetchGoogleFreeBusy("access-token", DATE_RANGE);

    expect(result).toEqual({
      busyBlocks: null,
      reason: "freebusy_request_failed (HTTP 403: Calendar API disabled)",
    });
  });

  test("fetchGoogleFreeBusy returns reason when primary calendar is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof globalThis.fetch;

    const result = await fetchGoogleFreeBusy("access-token", DATE_RANGE);

    expect(result).toEqual({
      busyBlocks: null,
      reason: "freebusy_missing_primary_calendar",
    });
  });

  test("fetchGoogleFreeBusy returns reason when primary calendar includes errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: {
            primary: {
              errors: [{ domain: "global", reason: "forbidden" }],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof globalThis.fetch;

    const result = await fetchGoogleFreeBusy("access-token", DATE_RANGE);

    expect(result).toEqual({
      busyBlocks: null,
      reason: "freebusy_calendar_error (global:forbidden)",
    });
  });

  test("fetchGoogleFreeBusy sends POST with correct auth headers and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await fetchGoogleFreeBusy("my-access-token", DATE_RANGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer my-access-token",
      }),
    );
    const body = JSON.parse(options.body as string);
    expect(body.timeMin).toBe(DATE_RANGE.start);
    expect(body.timeMax).toBe(DATE_RANGE.end);
    expect(body.items).toEqual([{ id: "primary" }]);
  });
});
