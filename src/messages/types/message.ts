import { z } from "zod";
import { toolCallSchema } from "./tool-call";

export const createMessageSchema = z.object({
  chatId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  clientId: z.string().optional(),
});

export const updateMessageSchema = createMessageSchema.partial();

export const messageSchema = createMessageSchema.extend({
  _id: z.string(),
  _creationTime: z.number(),
  model: z.string().optional(),
  isComplete: z.boolean().optional(),
  userId: z.string(),
  latestToolCall: toolCallSchema.nullable(),
});

export type CreateMessageType = z.infer<typeof createMessageSchema>;
export type UpdateMessageType = z.infer<typeof updateMessageSchema>;
export type MessageType = z.infer<typeof messageSchema>;
