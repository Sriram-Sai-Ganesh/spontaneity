/**
 * Shared location field contract — Issue #313
 *
 * Single source of truth for all location-related validators and Zod schemas.
 *
 * Planning Location (chats / user profiles)
 *   planningLocationField          — DB schema (create)
 *   planningLocationUpdateField    — DB schema (update, allows null to clear)
 *   Free-text city/region string used to scope event search.
 *
 * Venue Location (events)
 *   venueLocationFields            — core 3 fields all event tables store
 *   venueLocationEnrichmentFields  — optional Maps enrichment fields (#308)
 *   venueLocationAllFields         — combined (use in defineTable)
 *
 * Zod Schemas (NormalizedEvent runtime validation)
 *   VenueLocationZodFields             — core venue Zod fields
 *   VenueLocationEnrichmentZodFields   — enrichment Zod fields
 *   VenueLocationAllZodFields          — combined (use in NormalizedEventSchema)
 *
 * New location properties must be added here first, then imported by consumers.
 * Adding optional fields to Convex schemas is a safe migration.
 */
import { v } from "convex/values";
import { z } from "zod";

// ── Venue location (events) ──────────────────────────────────────

export const venueLocationFields = {
  venueName: v.optional(v.string()),
  venueCity: v.optional(v.string()),
  venueNeighborhood: v.optional(v.string()),
  venueCountry: v.optional(v.string()),
} as const;

export const venueLocationEnrichmentFields = {
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  formattedAddress: v.optional(v.string()),
  googlePlaceId: v.optional(v.string()),
} as const;

export const venueLocationAllFields = {
  ...venueLocationFields,
  ...venueLocationEnrichmentFields,
} as const;

// ── Planning location (chats / user profiles) ───────────────────

export const planningLocationField = {
  planningLocation: v.optional(v.string()),
} as const;

export const planningLocationUpdateField = {
  planningLocation: v.optional(v.union(v.string(), v.null())),
} as const;

// ── Midpoint (group meeting point for distance calculations) ────

export const midpointFields = {
  midpointLatitude: v.optional(v.number()),
  midpointLongitude: v.optional(v.number()),
  midpointLabel: v.optional(v.string()),
} as const;

export const midpointUpdateFields = {
  midpointLatitude: v.optional(v.union(v.number(), v.null())),
  midpointLongitude: v.optional(v.union(v.number(), v.null())),
  midpointLabel: v.optional(v.union(v.string(), v.null())),
} as const;

// ── Zod schemas (NormalizedEvent runtime validation) ─────────────

export const VenueLocationZodFields = {
  venueName: z.string().nullable(),
  venueCity: z.string().nullable(),
  venueNeighborhood: z.string().nullable().optional(),
  venueCountry: z.string().nullable(),
} as const;

export const VenueLocationEnrichmentZodFields = {
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  formattedAddress: z.string().nullable().optional(),
  googlePlaceId: z.string().nullable().optional(),
} as const;

export const VenueLocationAllZodFields = {
  ...VenueLocationZodFields,
  ...VenueLocationEnrichmentZodFields,
} as const;
