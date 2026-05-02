import { describe, expect, it } from "vitest";
import { getHueMintErrorMessage, selectPalette } from "./user_appearance_actions";

describe("selectPalette", () => {
  it("prefers the lowest-scoring palette from HueMint results", () => {
    expect(
      selectPalette({
        results: [
          {
            palette: ["#111111", "#222222", "#333333"],
            score: 0.72,
          },
          {
            palette: ["#aaaaaa", "#bbbbbb", "#cccccc"],
            score: 0.18,
          },
        ],
      }),
    ).toEqual(["#aaaaaa", "#bbbbbb", "#cccccc"]);
  });

  it("accepts alternate candidate shapes and normalizes hex values", () => {
    expect(
      selectPalette([
        {
          colors: ["#ABCDEF", "#123456", "#654321"],
        },
      ]),
    ).toEqual(["#abcdef", "#123456", "#654321"]);
  });

  it("returns null when no valid three-color palette is present", () => {
    expect(
      selectPalette({
        palettes: [
          {
            palette: ["#111111", "not-a-color"],
          },
        ],
      }),
    ).toBeNull();
  });

  it("formats abort errors as a timeout message", () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    expect(getHueMintErrorMessage(abortError)).toBe(
      "HueMint request timed out after 12s",
    );
  });
});
