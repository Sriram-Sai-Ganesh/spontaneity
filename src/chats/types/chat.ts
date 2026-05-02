import { z } from "zod";

export const createChatSchema = z.object({
  title: z.string().min(1),
  planningLocation: z.string().optional(),
});

export const updateChatSchema = z.object({
  title: z.string().min(1).optional(),
  planningLocation: z.string().nullable().optional(),
});

export const chatSchema = createChatSchema.extend({
  _id: z.string(),
  _creationTime: z.number(),
  memberRole: z.enum(["owner", "member"]).optional(),
  nickname: z.string().optional(),
  icon: z.string().optional(),
  kind: z.enum(["group", "ai"]).optional(),
  useDistanceRanking: z.boolean().optional(),
  midpointLatitude: z.number().optional(),
  midpointLongitude: z.number().optional(),
  midpointLabel: z.string().optional(),
  lastReadAt: z.number().optional(),
  lastMessageAt: z.number().optional(),
  hasUnread: z.boolean().optional(),
});

export type CreateChatType = z.infer<typeof createChatSchema>;
export type UpdateChatType = z.infer<typeof updateChatSchema>;
export type ChatType = z.infer<typeof chatSchema>;
