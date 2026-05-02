import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEventTags } from "./event_types";

type PollReaderCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export async function getOpenPollForChat(
  ctx: PollReaderCtx,
  chatId: Id<"chats">,
) {
  return ctx.db
    .query("event_polls")
    .withIndex("by_chat_status", (q) => q.eq("chatId", chatId).eq("status", "open"))
    .order("desc")
    .first();
}

export async function getLatestPollForChat(
  ctx: PollReaderCtx,
  chatId: Id<"chats">,
) {
  const polls = await ctx.db
    .query("event_polls")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .order("desc")
    .collect();
  const latest = polls[0] ?? null;
  return latest && !latest.dismissedAt ? latest : null;
}

export function normalizePollOption(
  option: Doc<"event_polls">["options"][number],
) {
  return {
    ...option,
    description: option.description ?? null,
    startTime: option.startTime ?? null,
    venueName: option.venueName ?? null,
    venueCity: option.venueCity ?? null,
    venueNeighborhood: option.venueNeighborhood ?? null,
    venueCountry: option.venueCountry ?? null,
    image: option.image ?? null,
    tags: normalizeEventTags(option.tags),
    status: option.status ?? null,
    budgetBucket: option.budgetBucket ?? null,
    genre: option.genre ?? null,
    venueType: option.venueType ?? undefined,
  };
}

export function computePollTallies(
  optionEventIds: string[],
  votes: Array<Doc<"event_poll_votes">>,
) {
  const tallyByEventId = new Map<string, number>(
    optionEventIds.map((eventId) => [eventId, 0]),
  );

  for (const vote of votes) {
    tallyByEventId.set(
      vote.eventId,
      (tallyByEventId.get(vote.eventId) ?? 0) + 1,
    );
  }

  if (votes.length === 0) {
    const leadingEventIds: string[] = [];
    return {
      tallyByEventId,
      leadingEventIds,
    };
  }

  let maxVotes = -1;
  let leadingEventIds: string[] = [];

  for (const eventId of optionEventIds) {
    const tally = tallyByEventId.get(eventId) ?? 0;
    if (tally > maxVotes) {
      maxVotes = tally;
      leadingEventIds = [eventId];
    } else if (tally === maxVotes) {
      leadingEventIds.push(eventId);
    }
  }

  return {
    tallyByEventId,
    leadingEventIds,
  };
}

export function resolveCompletedPollOutcome(
  optionEventIds: string[],
  votes: Array<Doc<"event_poll_votes">>,
) {
  const { leadingEventIds } = computePollTallies(optionEventIds, votes);

  if (leadingEventIds.length === 1) {
    return {
      resolution: "accepted" as const,
      acceptedEventId: leadingEventIds[0],
    };
  }

  return {
    resolution: "no_consensus" as const,
    acceptedEventId: undefined,
  };
}
