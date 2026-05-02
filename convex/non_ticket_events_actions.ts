import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { EventTag } from "./event_types";
import { tagEventWithAI } from "./events_actions";

export const tagAndUpdateNonTicketPlaces = internalAction({
  args: {
    chatId: v.id("chats"),
    placeIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const MAX_TAG_ATTEMPTS = 3;
    if (args.placeIds.length === 0) return;

    const existingRows = await ctx.runQuery(
      internal.non_ticket_events_mutations.getNonTicketPlacesForChatAndPlaceIds,
      { chatId: args.chatId, placeIds: args.placeIds },
    );

    await Promise.all(
      existingRows.map(async (place) => {
        if (!place) return;
        if (place.venueType === "food") return;
        if (place.tagsConfirmed && place.tags && place.tags.length > 0) return;

        const priorAttempts = place.tagAttempts ?? 0;
        if (priorAttempts >= MAX_TAG_ATTEMPTS) {
          await ctx.runMutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
            placeId: place.placeId,
            source: place.source,
            title: place.title,
            description: place.description,
            location: place.location,
            venueName: place.venueName,
            venueCity: place.venueCity,
            venueNeighborhood: place.venueNeighborhood,
            venueCountry: place.venueCountry,
            latitude: place.latitude,
            longitude: place.longitude,
            formattedAddress: place.formattedAddress,
            googlePlaceId: place.googlePlaceId,
            url: place.url,
            venueType: place.venueType,
            openHours: place.openHours,
            tags:
              (place.tags && place.tags.length > 0
                ? (place.tags as EventTag[])
                : (["None"] as EventTag[])),
            tagsConfirmed: true,
            tagAttempts: priorAttempts,
            budgetBucket: place.budgetBucket,
            chatId: args.chatId,
          });
          return;
        }

        const result = await tagEventWithAI({
          eventId: place.placeId,
          title: place.title,
          description: place.description ?? null,
          venueName: place.venueName ?? null,
          venueCity: place.venueCity ?? null,
        });

        const nextAttempts = priorAttempts + 1;
        const nextTags = result?.tags?.length ? (result.tags as EventTag[]) : undefined;
        const confirmed = nextTags !== undefined;

        await ctx.runMutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
          placeId: place.placeId,
          source: place.source,
          title: place.title,
          description: place.description,
          location: place.location,
          venueName: place.venueName,
          venueCity: place.venueCity,
          venueNeighborhood: place.venueNeighborhood,
          venueCountry: place.venueCountry,
          latitude: place.latitude,
          longitude: place.longitude,
          formattedAddress: place.formattedAddress,
          googlePlaceId: place.googlePlaceId,
          url: place.url,
          venueType: place.venueType,
          openHours: place.openHours,
          tags: nextTags,
          tagsConfirmed: confirmed,
          tagAttempts: nextAttempts,
          budgetBucket: place.budgetBucket,
          chatId: args.chatId,
        });
      }),
    );
  },
});
