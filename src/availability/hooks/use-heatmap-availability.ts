import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface BusyBlock {
  start: string;
  end: string;
}

export interface HeatmapMember {
  userId: string;
  name: string;
  busyBlocks: BusyBlock[];
  connected: boolean;
}

export interface HeatmapAcceptedPlan {
  pollId: string;
  chatId: string;
  chatTitle: string;
  chatIcon: string | null;
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  venueName: string | null;
  venueCity: string | null;
  source: string;
  url: string;
  resolvedAt: number;
}

export interface HeatmapRSVPEvent {
  eventId: string;
  chatId: string;
  title: string;
  startTime: string;
  endTime: string;
  source: string;
  goingUserIds: string[];
}

export interface HeatmapData {
  memberCount: number;
  dateRange: { start: string; end: string };
  members: HeatmapMember[];
  acceptedPlans: HeatmapAcceptedPlan[];
  goingRSVPEvents: HeatmapRSVPEvent[];
  error?: string;
}

export function useHeatmapAvailability(chatId: string) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getHeatmap = useAction(api.availability_action.getHeatmapAvailability);
  const acceptedPlans = useQuery(api.event_polls_queries.getAcceptedPlansForViewer, {});
  const goingRSVPs = useQuery(api.rsvp_queries.getGoingRSVPEventsForViewer, {});
  const previousAcceptedPlansSignatureRef = useRef<string | null>(null);
  const previousGoingRSVPsSignatureRef = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getHeatmap({
        chatId: chatId as Id<"chats">,
      });
      setData(result as HeatmapData);
      if (result.error) {
        setError(result.error as string);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load availability");
    } finally {
      setLoading(false);
    }
  }, [chatId, getHeatmap]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const acceptedPlansSignature = JSON.stringify(
    acceptedPlans?.map((plan) => ({
      pollId: plan.pollId,
      chatId: plan.chatId,
      chatTitle: plan.chatTitle,
      eventId: plan.eventId,
      startTime: plan.startTime,
      resolvedAt: plan.resolvedAt,
      chatIcon: plan.chatIcon ?? null,
    })) ?? null,
  );

  useEffect(() => {
    if (previousAcceptedPlansSignatureRef.current === null) {
      previousAcceptedPlansSignatureRef.current = acceptedPlansSignature;
      return;
    }

    if (previousAcceptedPlansSignatureRef.current !== acceptedPlansSignature) {
      previousAcceptedPlansSignatureRef.current = acceptedPlansSignature;
      void fetch();
    }
  }, [acceptedPlansSignature, fetch]);

  const goingRSVPsSignature = JSON.stringify(
    goingRSVPs?.map((evt) => ({
      eventId: evt.eventId,
      chatId: evt.chatId,
      startTime: evt.startTime,
    })) ?? null,
  );

  useEffect(() => {
    if (previousGoingRSVPsSignatureRef.current === null) {
      previousGoingRSVPsSignatureRef.current = goingRSVPsSignature;
      return;
    }

    if (previousGoingRSVPsSignatureRef.current !== goingRSVPsSignature) {
      previousGoingRSVPsSignatureRef.current = goingRSVPsSignature;
      void fetch();
    }
  }, [goingRSVPsSignature, fetch]);

  return { data, loading, error, refresh: fetch };
}
