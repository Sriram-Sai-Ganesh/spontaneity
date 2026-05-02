import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, createTestUser } from "./test.setup";

const streamTextMock = vi.fn();
const createOpenRouterMock = vi.fn();

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (...args: unknown[]) => createOpenRouterMock(...args),
}));

function makeTextStream(json: string) {
  return (async function* () {
    yield json;
  })();
}

beforeEach(() => {
  createOpenRouterMock.mockReturnValue({
    chat: vi.fn().mockReturnValue("mock-model"),
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("classifyPreferences", () => {
  it("classifies likes and dislikes into valid event tags", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    // First call: likes. Second call: dislikes.
    streamTextMock
      .mockResolvedValueOnce({ textStream: makeTextStream('{"tags":["Concert","Hiking"]}') })
      .mockResolvedValueOnce({ textStream: makeTextStream('{"tags":["Festival"]}') });

    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "concerts and hiking",
        dislikesText: "outdoor festivals",
        allergiesText: "",
        openRouterApiKey: "test-key",
      });

    expect(result.likes).toEqual(["Concert", "Hiking"]);
    expect(result.dislikes).toEqual(["Festival"]);
    expect(result.allergies).toEqual([]);
  });

  it("returns allergies as raw parsed items without AI classification", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    // No streamText calls expected — empty likes/dislikes return early, allergies bypass AI
    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "",
        dislikesText: "",
        allergiesText: "peanuts, dairy, gluten-free",
        openRouterApiKey: "test-key",
      });

    expect(result.allergies).toEqual(["peanuts", "dairy", "gluten-free"]);
    expect(result.likes).toEqual([]);
    expect(result.dislikes).toEqual([]);
  });

  it("returns empty arrays when all inputs are empty", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    // No streamText calls expected — all inputs empty, early return
    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "",
        dislikesText: "",
        allergiesText: "",
        openRouterApiKey: "test-key",
      });

    expect(result.likes).toEqual([]);
    expect(result.dislikes).toEqual([]);
    expect(result.allergies).toEqual([]);
  });

  it("filters out invalid tags returned by the AI", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    streamTextMock
      .mockResolvedValueOnce({
        textStream: makeTextStream('{"tags":["Concert","FakeTag","Hiking","AnotherInvalid"]}'),
      })
      .mockResolvedValueOnce({ textStream: makeTextStream('{"tags":[]}') });

    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "concerts and hiking",
        dislikesText: "",
        allergiesText: "",
        openRouterApiKey: "test-key",
      });

    expect(result.likes).toEqual(["Concert", "Hiking"]);
    expect(result.likes).not.toContain("FakeTag");
    expect(result.likes).not.toContain("AnotherInvalid");
  });

  it("does not call AI for empty like/dislike texts", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "",
        dislikesText: "",
        allergiesText: "shellfish",
        openRouterApiKey: "test-key",
      });

    // streamText should NOT have been called since both texts are empty
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result.likes).toEqual([]);
    expect(result.dislikes).toEqual([]);
    expect(result.allergies).toEqual(["shellfish"]);
  });

  it("handles malformed AI JSON response gracefully", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    streamTextMock
      .mockResolvedValueOnce({ textStream: makeTextStream("not valid json at all") })
      .mockResolvedValueOnce({ textStream: makeTextStream('{"tags":[]}') });

    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "something",
        dislikesText: "",
        allergiesText: "",
        openRouterApiKey: "test-key",
      });

    // Falls back to empty on parse failure
    expect(result.likes).toEqual([]);
  });

  it("does not classify None or Custom tags even if AI returns them", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    streamTextMock
      .mockResolvedValueOnce({
        textStream: makeTextStream('{"tags":["Concert","None","Custom"]}'),
      })
      .mockResolvedValueOnce({ textStream: makeTextStream('{"tags":[]}') });

    const result = await t
      .withIdentity(identity)
      .action(api.classify_preferences_action.classifyPreferences, {
        likesText: "concerts",
        dislikesText: "",
        allergiesText: "",
        openRouterApiKey: "test-key",
      });

    expect(result.likes).toEqual(["Concert"]);
    expect(result.likes).not.toContain("None");
    expect(result.likes).not.toContain("Custom");
  });

  it("throws when no API key is available", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    await expect(
      t.withIdentity(identity).action(api.classify_preferences_action.classifyPreferences, {
        likesText: "concerts",
        dislikesText: "",
        allergiesText: "",
        // no openRouterApiKey and process.env.OPENROUTER_API_KEY is not set in tests
      }),
    ).rejects.toThrow("No OpenRouter API key available");
  });
});
