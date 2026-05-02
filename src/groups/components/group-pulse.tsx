import { Activity, TrendingUp, AlertTriangle, Clock, Sparkles, RefreshCw } from "lucide-react";
import { useQuery, useAction } from "convex/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { RightPanelToggle } from "@/components/right-panel-toggle";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface GroupPulseProps {
  chatId: string;
  collapsed?: boolean;
  focused?: boolean;
  onToggle?: () => void;
}

function formatPercent(value: number | null): string {
  if (value === null) return "\u2014";
  return `${Math.round(value * 100)}%`;
}

function formatTimestamp(value: number | null): string {
  if (value === null) return "No activity yet";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PercentBar({ value, color }: { value: number | null; color: string }) {
  const width = value === null ? 0 : Math.round(value * 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

const GroupPulse: React.FC<GroupPulseProps> = ({
  chatId,
  collapsed = false,
  focused = false,
  onToggle,
}) => {
  const metrics = useQuery(api.recommendation_metrics_queries.getRecommendationMetricsForChat, {
    chatId: chatId as Id<"chats">,
  });

  const generateSummary = useAction(api.group_pulse_actions.generateGroupPulseSummary);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const fetchedForChat = useRef<string | null>(null);

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      const result = await generateSummary({ chatId: chatId as Id<"chats"> });
      setSummary(result);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [generateSummary, chatId]);

  useEffect(() => {
    if (
      metrics &&
      (metrics.recommendationRunsCount > 0 || metrics.actionableFeedbackCount > 0) &&
      fetchedForChat.current !== chatId
    ) {
      fetchedForChat.current = chatId;
      setSummaryLoading(true);
      setSummary(null);
      generateSummary({ chatId: chatId as Id<"chats"> })
        .then(setSummary)
        .catch(() => {})
        .finally(() => setSummaryLoading(false));
    }
  }, [metrics, generateSummary, chatId]);

  const header = (
    <div className="flex items-center justify-between">
      <RightPanelToggle
        collapsed={collapsed}
        focused={focused}
        onToggle={onToggle}
      >
        Group Pulse
      </RightPanelToggle>
      <Activity className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );

  if (collapsed) {
    return (
      <div className="flex flex-col p-3 gap-1 shrink-0">
        {header}
        <p className="text-[10px] text-muted-foreground">
          {!metrics
            ? "Loading activity..."
            : metrics.recommendationRunsCount === 0
              ? "No recommendations yet"
              : `${formatPercent(metrics.acceptRate)} accept \u00b7 ${formatPercent(metrics.fallbackUsageRate)} fallback`}
        </p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col flex-1 shrink min-h-0 p-3 gap-2 overflow-auto">
        {header}
        <p className="text-xs text-muted-foreground">Loading group activity...</p>
      </div>
    );
  }

  if (metrics.recommendationRunsCount === 0 && metrics.actionableFeedbackCount === 0) {
    return (
      <div className="flex flex-col flex-1 shrink min-h-0 p-3 gap-2 overflow-auto">
        {header}
        <div className="flex flex-col items-center gap-2 py-4">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground text-center">
            Metrics will appear after the group runs its first recommendation search.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 shrink min-h-0 p-3 gap-3 overflow-auto">
      {header}

      {/* Rate cards */}
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border bg-card p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 shrink-0" />
              Accept Rate
            </div>
            <span className="text-sm font-semibold">{formatPercent(metrics.acceptRate)}</span>
          </div>
          <PercentBar value={metrics.acceptRate} color="bg-status-success" />
          <p className="text-[10px] text-muted-foreground">
            {metrics.acceptedCount} accepted / {metrics.actionableFeedbackCount} decisions
          </p>
        </div>

        <div className="rounded-lg border bg-card p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Fallback Usage
            </div>
            <span className="text-sm font-semibold">{formatPercent(metrics.fallbackUsageRate)}</span>
          </div>
          <PercentBar value={metrics.fallbackUsageRate} color="bg-status-warning" />
          <p className="text-[10px] text-muted-foreground">
            {metrics.fallbackUsageCount} fallbacks / {metrics.recommendationRunsCount} searches
          </p>
        </div>
      </div>

      {/* Feedback breakdown */}
      <div className="rounded-lg border bg-card p-2.5 space-y-1">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
          Feedback breakdown
        </p>
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            { label: "Accept", count: metrics.acceptedCount },
            { label: "Reject", count: metrics.rejectedCount },
            { label: "Cancel", count: metrics.cancelledCount },
            { label: "More", count: metrics.moreLikeThisCount },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-lg font-semibold leading-none">
                {item.count}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        <span>Last search: {formatTimestamp(metrics.lastRecommendedAt)}</span>
      </div>

      {metrics.lastFallbackReason && (
        <p className="text-[10px] text-muted-foreground pl-[18px]">
          Last fallback: {metrics.lastFallbackReason}
        </p>
      )}

      {/* AI summary */}
      <div className="rounded-lg border bg-card p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
            <Sparkles className="h-3 w-3 shrink-0" />
            Group Vibes:
          </div>
          <button
            type="button"
            onClick={refreshSummary}
            disabled={summaryLoading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            aria-label="Refresh AI summary"
          >
            <RefreshCw className={`h-3 w-3 ${summaryLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {summaryLoading ? (
          <p className="text-[10px] text-muted-foreground italic">Generating summary…</p>
        ) : summary ? (
          <p className="text-[10px] text-foreground/80 leading-relaxed">{summary}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">No summary available.</p>
        )}
      </div>
    </div>
  );
};

export default GroupPulse;
