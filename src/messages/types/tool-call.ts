import { z } from "zod";

const toolCallPayloadSchema = z.record(z.string(), z.unknown());

export const toolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  state: z.enum(["input-available", "output-available"]),
  args: toolCallPayloadSchema,
  result: toolCallPayloadSchema.optional(),
});

export type ToolCallPart = z.infer<typeof toolCallSchema>;
