import {
  customQuery,
  customMutation,
  customAction,
} from "convex-helpers/server/customFunctions";
import {
  query as baseQuery,
  mutation as baseMutation,
  action as baseAction,
  type QueryCtx,
  type MutationCtx,
  type ActionCtx,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// ── Authenticated context types ──────────────────────────────────

export type AuthQueryCtx = QueryCtx & { userId: Id<"users"> };
export type AuthMutationCtx = MutationCtx & { userId: Id<"users"> };
export type AuthActionCtx = ActionCtx & { userId: Id<"users"> };

// ── Custom functions requiring auth ──────────────────────────────

export const queryWithAuth = customQuery(baseQuery, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return { ctx: { userId }, args: {} };
  },
});

export const mutationWithAuth = customMutation(baseMutation, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return { ctx: { userId }, args: {} };
  },
});

export const actionWithAuth = customAction(baseAction, {
  args: {},
  input: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return { ctx: { userId }, args: {} };
  },
});
