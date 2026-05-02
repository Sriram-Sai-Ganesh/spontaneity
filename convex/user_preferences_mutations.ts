import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutationWithAuth } from "./lib";

/**
 * Internal: update a user's event type preferences by userId.
 * action="replace" (default): overwrite the full list.
 * action="add": merge the given types into the existing list (no duplicates).
 * action="remove": remove the given types from the existing list.
 * Used from the HTTP chat action (which has userId but cannot pass auth to mutations).
 */
export const setUserEventPreferencesInternal = internalMutation({
  args: {
    userId: v.id("users"),
    preferredEventTypes: v.array(v.string()),
    negativeEventTypes: v.optional(v.array(v.string())),
    action: v.optional(v.union(v.literal("add"), v.literal("remove"), v.literal("replace"))),
    allergies: v.optional(v.array(v.string())),
    dietaryRestrictions: v.optional(v.array(v.string())),
    cuisinePreferences: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { userId, preferredEventTypes, negativeEventTypes, action = "replace", allergies, dietaryRestrictions, cuisinePreferences }) => {
    const normalized = preferredEventTypes
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const normalizedNegative = (negativeEventTypes ?? [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const normalizeRaw = (arr?: string[]) =>
      arr !== undefined
        ? arr.map((s) => s.trim().toLowerCase()).filter(Boolean)
        : undefined;

    if (normalized.length === 0 && normalizedNegative.length === 0 &&
        allergies === undefined && dietaryRestrictions === undefined && cuisinePreferences === undefined) return;

    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    let newPreferred: string[];
    let newNegative: string[];

    if (action === "add") {
      const existingPreferred = existing?.preferredEventTypes ?? [];
      const existingNegative = existing?.negativeEventTypes ?? [];
      // Add to positive list, remove from negative list (and vice versa)
      newPreferred = Array.from(new Set([...existingPreferred, ...normalized]));
      newNegative = Array.from(new Set([...existingNegative, ...normalizedNegative]))
        .filter((t) => !normalized.includes(t));
      newPreferred = newPreferred.filter((t) => !normalizedNegative.includes(t));
    } else if (action === "remove") {
      const existingPreferred = existing?.preferredEventTypes ?? [];
      const existingNegative = existing?.negativeEventTypes ?? [];
      newPreferred = existingPreferred.filter((t) => !normalized.includes(t));
      newNegative = existingNegative.filter((t) => !normalizedNegative.includes(t));
    } else {
      // replace (default)
      newPreferred = normalized;
      newNegative = normalizedNegative;
    }

    const patch: Record<string, unknown> = {
      preferredEventTypes: newPreferred,
      negativeEventTypes: newNegative,
    };
    const normAllergies = normalizeRaw(allergies);
    const normDietary = normalizeRaw(dietaryRestrictions);
    const normCuisine = normalizeRaw(cuisinePreferences);
    if (normAllergies !== undefined) patch.allergies = normAllergies;
    if (normDietary !== undefined) patch.dietaryRestrictions = normDietary;
    if (normCuisine !== undefined) patch.cuisinePreferences = normCuisine;

    if (existing) {
      await ctx.db.patch(existing._id, patch as Record<string, unknown>);
    } else {
      await ctx.db.insert("userEventPreferences", {
        userId,
        preferredEventTypes: newPreferred,
        negativeEventTypes: newNegative,
        ...(normAllergies !== undefined && { allergies: normAllergies }),
        ...(normDietary !== undefined && { dietaryRestrictions: normDietary }),
        ...(normCuisine !== undefined && { cuisinePreferences: normCuisine }),
      });
    }
  },
});

/**
 * Set or update the current user's event type preferences.
 * This will overwrite any existing preferences.
 */
export const setUserEventPreferences = mutationWithAuth({
  args: {
    preferredEventTypes: v.array(v.string()),
    negativeEventTypes: v.optional(v.array(v.string())),
    rawLikes: v.optional(v.array(v.string())),
    rawDislikes: v.optional(v.array(v.string())),
    allergies: v.optional(v.array(v.string())),
    dietaryRestrictions: v.optional(v.array(v.string())),
    cuisinePreferences: v.optional(v.array(v.string())),
    personSpecificLikes: v.optional(v.record(v.string(), v.array(v.string()))),
    personSpecificDislikes: v.optional(v.record(v.string(), v.array(v.string()))),
  },
  returns: v.object({
    userId: v.id("users"),
    preferredEventTypes: v.array(v.string()),
    negativeEventTypes: v.array(v.string()),
  }),
  handler: async (ctx, { preferredEventTypes, negativeEventTypes, rawLikes, rawDislikes, allergies, dietaryRestrictions, cuisinePreferences, personSpecificLikes, personSpecificDislikes }) => {
    const normalizedNegative = negativeEventTypes ?? [];
    const normalize = (arr?: string[]) =>
      arr !== undefined
        ? Array.from(new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean)))
        : undefined;
    const normalizedRawLikes = normalize(rawLikes);
    const normalizedRawDislikes = normalize(rawDislikes);
    const normalizedAllergies = normalize(allergies);
    const normalizedDietary = normalize(dietaryRestrictions);
    const normalizedCuisine = normalize(cuisinePreferences);

    // First, try to find existing preferences
    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const patch = {
      preferredEventTypes,
      negativeEventTypes: normalizedNegative,
      ...(normalizedRawLikes !== undefined && { rawLikes: normalizedRawLikes }),
      ...(normalizedRawDislikes !== undefined && { rawDislikes: normalizedRawDislikes }),
      ...(normalizedAllergies !== undefined && { allergies: normalizedAllergies }),
      ...(normalizedDietary !== undefined && { dietaryRestrictions: normalizedDietary }),
      ...(normalizedCuisine !== undefined && { cuisinePreferences: normalizedCuisine }),
      ...(personSpecificLikes !== undefined && { personSpecificLikes }),
      ...(personSpecificDislikes !== undefined && { personSpecificDislikes }),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userEventPreferences", { userId: ctx.userId, ...patch });
    }

    return {
      userId: ctx.userId,
      preferredEventTypes,
      negativeEventTypes: normalizedNegative,
    };
  },
});

/**
 * Set or merge person-specific likes/dislikes for a particular other user.
 * action="replace": overwrite the full list for that person.
 * action="add": merge tags into the existing list for that person.
 * action="remove": remove tags from the existing list for that person.
 */
export const setPersonSpecificPreferences = mutationWithAuth({
  args: {
    otherUserId: v.string(),
    likes: v.optional(v.array(v.string())),
    dislikes: v.optional(v.array(v.string())),
    action: v.optional(v.union(v.literal("add"), v.literal("remove"), v.literal("replace"))),
  },
  returns: v.null(),
  handler: async (ctx, { otherUserId, likes, dislikes, action = "replace" }) => {
    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const existingLikes: Record<string, string[]> = existing?.personSpecificLikes ?? {};
    const existingDislikes: Record<string, string[]> = existing?.personSpecificDislikes ?? {};

    let newLikesForPerson: string[];
    let newDislikesForPerson: string[];

    if (action === "add") {
      newLikesForPerson = Array.from(new Set([...(existingLikes[otherUserId] ?? []), ...(likes ?? [])]));
      newDislikesForPerson = Array.from(new Set([...(existingDislikes[otherUserId] ?? []), ...(dislikes ?? [])]));
    } else if (action === "remove") {
      newLikesForPerson = (existingLikes[otherUserId] ?? []).filter((t) => !(likes ?? []).includes(t));
      newDislikesForPerson = (existingDislikes[otherUserId] ?? []).filter((t) => !(dislikes ?? []).includes(t));
    } else {
      // replace
      newLikesForPerson = likes ?? existingLikes[otherUserId] ?? [];
      newDislikesForPerson = dislikes ?? existingDislikes[otherUserId] ?? [];
    }

    const newPersonSpecificLikes = { ...existingLikes, [otherUserId]: newLikesForPerson };
    const newPersonSpecificDislikes = { ...existingDislikes, [otherUserId]: newDislikesForPerson };

    if (existing) {
      await ctx.db.patch(existing._id, {
        personSpecificLikes: newPersonSpecificLikes,
        personSpecificDislikes: newPersonSpecificDislikes,
      });
    } else {
      await ctx.db.insert("userEventPreferences", {
        userId: ctx.userId,
        preferredEventTypes: [],
        personSpecificLikes: newPersonSpecificLikes,
        personSpecificDislikes: newPersonSpecificDislikes,
      });
    }

    return null;
  },
});

/**
 * Internal: set or merge person-specific likes/dislikes for a particular other user.
 * Used from the HTTP chat action (which has userId but cannot pass auth to mutations).
 */
export const setPersonSpecificPreferencesInternal = internalMutation({
  args: {
    userId: v.id("users"),
    otherUserId: v.string(),
    likes: v.optional(v.array(v.string())),
    dislikes: v.optional(v.array(v.string())),
    action: v.optional(v.union(v.literal("add"), v.literal("remove"), v.literal("replace"))),
  },
  handler: async (ctx, { userId, otherUserId, likes, dislikes, action = "replace" }) => {
    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    const existingLikes: Record<string, string[]> = existing?.personSpecificLikes ?? {};
    const existingDislikes: Record<string, string[]> = existing?.personSpecificDislikes ?? {};

    let newLikesForPerson: string[];
    let newDislikesForPerson: string[];

    if (action === "add") {
      newLikesForPerson = Array.from(new Set([...(existingLikes[otherUserId] ?? []), ...(likes ?? [])]));
      newDislikesForPerson = Array.from(new Set([...(existingDislikes[otherUserId] ?? []), ...(dislikes ?? [])]));
    } else if (action === "remove") {
      newLikesForPerson = (existingLikes[otherUserId] ?? []).filter((t) => !(likes ?? []).includes(t));
      newDislikesForPerson = (existingDislikes[otherUserId] ?? []).filter((t) => !(dislikes ?? []).includes(t));
    } else {
      // replace
      newLikesForPerson = likes ?? existingLikes[otherUserId] ?? [];
      newDislikesForPerson = dislikes ?? existingDislikes[otherUserId] ?? [];
    }

    const newPersonSpecificLikes = { ...existingLikes, [otherUserId]: newLikesForPerson };
    const newPersonSpecificDislikes = { ...existingDislikes, [otherUserId]: newDislikesForPerson };

    if (existing) {
      await ctx.db.patch(existing._id, {
        personSpecificLikes: newPersonSpecificLikes,
        personSpecificDislikes: newPersonSpecificDislikes,
      });
    } else {
      await ctx.db.insert("userEventPreferences", {
        userId,
        preferredEventTypes: [],
        personSpecificLikes: newPersonSpecificLikes,
        personSpecificDislikes: newPersonSpecificDislikes,
      });
    }
  },
});