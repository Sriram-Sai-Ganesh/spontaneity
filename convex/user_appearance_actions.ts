import { internalAction } from "./_generated/server";
import { actionWithAuth } from "./lib";
import { themeColorsValidator } from "./user_appearance_schema";

const HUEMINT_API_URL = "https://api.huemint.com/color";
const HUEMINT_REQUEST_TIMEOUT_MS = 12_000;
const HUEMINT_REQUEST = {
  mode: "random",
  num_colors: 3,
  num_results: 5,
  temperature: "1.2",
  adjacency: ["0", "16", "64", "16", "0", "52", "64", "52", "0"],
  palette: ["-", "-", "-"],
} as const;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

type HueMintPaletteCandidate = {
  palette?: unknown;
  colors?: unknown;
  score?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeHexColor(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized : null;
}

function extractPaletteColors(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const colors = value
    .map((entry) => normalizeHexColor(entry))
    .filter((entry): entry is string => entry !== null);

  return colors.length >= 3 ? colors.slice(0, 3) : null;
}

function extractCandidates(payload: unknown): HueMintPaletteCandidate[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.results)) {
    return payload.results.filter(isRecord);
  }

  if (Array.isArray(payload.palettes)) {
    return payload.palettes.filter(isRecord);
  }

  return [payload];
}

function getCandidatePalette(candidate: HueMintPaletteCandidate) {
  return (
    extractPaletteColors(candidate.palette) ??
    extractPaletteColors(candidate.colors)
  );
}

function getCandidateScore(candidate: HueMintPaletteCandidate) {
  return typeof candidate.score === "number"
    ? candidate.score
    : Number.POSITIVE_INFINITY;
}

export function selectPalette(payload: unknown) {
  const candidates = extractCandidates(payload)
    .map((candidate) => ({
      colors: getCandidatePalette(candidate),
      score: getCandidateScore(candidate),
    }))
    .filter(
      (
        candidate,
      ): candidate is { colors: [string, string, string]; score: number } =>
        Array.isArray(candidate.colors) && candidate.colors.length === 3,
    )
    .sort((left, right) => left.score - right.score);

  return candidates[0]?.colors ?? null;
}

export function getHueMintErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return `HueMint request timed out after ${HUEMINT_REQUEST_TIMEOUT_MS / 1000}s`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "HueMint request failed";
}

async function generateRandomAppearancePaletteColors() {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    HUEMINT_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(HUEMINT_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(HUEMINT_REQUEST),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HueMint request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const palette = selectPalette(payload);

    if (!palette) {
      throw new Error("HueMint did not return a valid 3-color palette");
    }

    return {
      primary: palette[0],
      secondary: palette[1],
      accent: palette[2],
    };
  } catch (error) {
    throw new Error(getHueMintErrorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

export const generateRandomAppearancePaletteInternal = internalAction({
  args: {},
  returns: themeColorsValidator,
  handler: async () => generateRandomAppearancePaletteColors(),
});

export const generateRandomAppearancePalette = actionWithAuth({
  args: {},
  returns: themeColorsValidator,
  handler: async () => generateRandomAppearancePaletteColors(),
});
