/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

// Export all convex modules for testing
export const modules = import.meta.glob("./**/*.ts");

/**
 * Create a fresh Convex test instance.
 */
export function createTestConvex() {
  return convexTest(schema, modules);
}

/**
 * Create an anonymous test user and return the identity + userId.
 */
export async function createTestUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", {});
  });

  const identity = {
    subject: userId,
    tokenIdentifier: `https://test.convex.dev|${userId}`,
  };

  return { userId, identity };
}

/**
 * Create a chat for a user and return the chatId.
 */
export async function createTestChat(
  t: ReturnType<typeof convexTest>,
  identity: { subject: string; tokenIdentifier: string },
  title = "Test Chat",
) {
  return t
    .withIdentity(identity)
    .mutation(api.chats_mutations.create, { title });
}

/**
 * Create a message in a chat.
 */
export async function createTestMessage(
  t: ReturnType<typeof convexTest>,
  identity: { subject: string; tokenIdentifier: string },
  chatId: ReturnType<typeof createTestChat> extends Promise<infer R>
    ? R
    : never,
  content = "Hello",
  role: "user" | "assistant" = "user",
) {
  return t
    .withIdentity(identity)
    .mutation(api.messages_mutations.create, { chatId, role, content });
}
