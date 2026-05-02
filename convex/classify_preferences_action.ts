import { v } from "convex/values";
import { actionWithAuth } from "./lib";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { AllEventTags } from "./event_types";

const AVAILABLE_TAGS = AllEventTags.filter(tag => tag !== "None" && tag !== "Custom");

function buildClassificationSystemPrompt(): string {
  return `You are a JSON-only preference classifier. You MUST respond with ONLY a valid JSON object. No explanations, no prose, no markdown, no code fences. Your entire response must be parseable JSON.`;
}

function buildClassificationPrompt(
  textToParse: string,
  category: "likes" | "dislikes",
): string {
  const categoryDescription =
    category === "likes"
      ? "things the user enjoys doing"
      : "things the user does NOT want to do";

  const availableTags = AVAILABLE_TAGS.join(", ");

  return `Classify user input about their ${categoryDescription} into event tags.

Available tags: ${availableTags}

User input: "${textToParse}"

Rules:
- If input is empty or says "none", return {"tags":[]}
- For each item, pick the best matching tag (exact match first, then similar vibe)
- Only return tags from the available list above

Respond with ONLY this JSON, nothing else: {"tags":["Tag1","Tag2"]}`;
}

interface ClassificationResponse {
  likes: string[];
  dislikes: string[];
  allergies: string[];
  dietaryRestrictions: string[];
  cuisinePreferences: string[];
}

export const classifyPreferences = actionWithAuth({
  args: {
    likesText: v.string(),
    dislikesText: v.string(),
    allergiesText: v.string(),
    dietaryRestrictionsText: v.optional(v.string()),
    cuisinePreferencesText: v.optional(v.string()),
    openRouterApiKey: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.object({
    likes: v.array(v.string()),
    dislikes: v.array(v.string()),
    allergies: v.array(v.string()),
    dietaryRestrictions: v.array(v.string()),
    cuisinePreferences: v.array(v.string()),
  }),
  handler: async (
    ctx,
    { likesText, dislikesText, allergiesText, dietaryRestrictionsText, cuisinePreferencesText, openRouterApiKey, model },
  ): Promise<ClassificationResponse> => {
    const effectiveApiKey = (openRouterApiKey ?? "").trim() || process.env.OPENROUTER_API_KEY;
    if (!effectiveApiKey) {
      throw new Error("No OpenRouter API key available");
    }

    const effectiveModel = model || "anthropic/claude-sonnet-4-5";

    const openrouter = createOpenRouter({ apiKey: effectiveApiKey });

    const classify = async (text: string, category: "likes" | "dislikes") => {
      if (!text.trim()) {
        return [];
      }

      try {
        const result = streamText({
          model: openrouter.chat(effectiveModel),
          maxOutputTokens: 300,
          messages: [
            {
              role: "system",
              content: buildClassificationSystemPrompt(),
            },
            {
              role: "user",
              content: buildClassificationPrompt(text.trim(), category),
            },
          ],
        });

        let rawText = "";
        for await (const chunk of (await result).textStream) {
          rawText += chunk;
        }

        // Extract JSON from anywhere in the response
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn(`[classifyPreferences] No JSON found in response for ${category}:`, rawText.slice(0, 200));
          return [];
        }

        const parsed = JSON.parse(jsonMatch[0]) as { tags: unknown };
        const tags = Array.isArray(parsed.tags) ? parsed.tags : [];

        // Validate that all returned tags are in our available tags
        const validTags: string[] = [];
        for (const tag of tags) {
          if (AVAILABLE_TAGS.includes(tag as typeof AVAILABLE_TAGS[number])) {
            validTags.push(tag);
          }
        }
        return validTags;
      } catch (err) {
        console.error(`[classifyPreferences] Failed to classify ${category}:`, err);
        return [];
      }
    };

    // Allergies, dietary restrictions, and cuisine are stored as raw text — no AI classification needed
    const parseRawItems = (text: string) =>
      text
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    const [likes, dislikes] = await Promise.all([
      classify(likesText, "likes"),
      classify(dislikesText, "dislikes"),
    ]);

    return {
      likes,
      dislikes,
      allergies: parseRawItems(allergiesText),
      dietaryRestrictions: parseRawItems(dietaryRestrictionsText ?? ""),
      cuisinePreferences: parseRawItems(cuisinePreferencesText ?? ""),
    };
  },
});
