import { Fragment, useMemo, useState } from "react";
import { RefreshCw, AlertCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RightPanelToggle } from "@/components/right-panel-toggle";
import { formatEventSourceLabel } from "@/lib/event-source-presentation";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  useHeatmapAvailability,
  type HeatmapAcceptedPlan,
  type HeatmapMember,
  type HeatmapRSVPEvent,
} from "../hooks/use-heatmap-availability";

interface AvailabilityHeatmapProps {
  chatId: string;
  collapsed?: boolean;
  focused?: boolean;
  onToggle?: () => void;
}

const DISPLAY_START_HOUR = 9;
const DISPLAY_END_HOUR = 23;
const HOURS = Array.from(
  { length: DISPLAY_END_HOUR - DISPLAY_START_HOUR },
  (_, i) => DISPLAY_START_HOUR + i,
);

const HEATMAP_COLORS = [
  "var(--heatmap-0)",
  "var(--heatmap-1)",
  "var(--heatmap-2)",
  "var(--heatmap-3)",
  "var(--heatmap-4)",
  "var(--heatmap-5)",
  "var(--heatmap-6)",
];
const MAX_VISIBLE_PLAN_ICONS = 2;

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "p" : "a";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}${suffix}`;
}

function formatDayHeader(date: Date): { day: string; date: string } {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: days[date.getDay()],
    date: `${date.getMonth() + 1}/${date.getDate()}`,
  };
}

function getPlanIcon(plan: HeatmapAcceptedPlan): string {
  return plan.chatIcon?.trim() || "👥";
}

function formatPlanTime(iso: string): string | null {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return value.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPlanTimeRange(plan: HeatmapAcceptedPlan): string | null {
  const start = formatPlanTime(plan.startTime);
  const end = formatPlanTime(plan.endTime);
  if (!start || !end) {
    return null;
  }
  return `${start}-${end}`;
}

function formatPlanLocation(plan: HeatmapAcceptedPlan): string | null {
  const location = [plan.venueName, plan.venueCity].filter(Boolean).join(", ");
  return location || null;
}

function formatPlanSummary(plan: HeatmapAcceptedPlan): string {
  return [
    `${getPlanIcon(plan)} ${plan.title}`,
    plan.chatTitle,
    formatPlanTimeRange(plan),
    formatPlanLocation(plan),
    formatEventSourceLabel(plan.source),
  ]
    .filter(Boolean)
    .join(" · ");
}

function getDaysInRange(start: string, end: string): Date[] {
  const days: Date[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);
  const current = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const last = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );

  while (current <= last && days.length < 7) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function isUserBusy(
  member: HeatmapMember,
  slotStart: number,
  slotEnd: number,
): boolean {
  return member.busyBlocks.some((block) => {
    const bStart = new Date(block.start).getTime();
    const bEnd = new Date(block.end).getTime();
    return bStart < slotEnd && bEnd > slotStart;
  });
}

interface SlotInfo {
  freeCount: number;
  totalMembers: number;
  freeNames: string[];
  acceptedPlans: HeatmapAcceptedPlan[];
  goingRSVPEvents: HeatmapRSVPEvent[];
}

function computeGrid(
  members: HeatmapMember[],
  acceptedPlans: HeatmapAcceptedPlan[],
  goingRSVPEvents: HeatmapRSVPEvent[],
  days: Date[],
): SlotInfo[][] {
  return days.map((day) =>
    HOURS.map((hour) => {
      const slotStart = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        hour,
      ).getTime();
      const slotEnd = slotStart + 60 * 60 * 1000;
      const freeNames: string[] = [];
      for (const member of members) {
        if (!isUserBusy(member, slotStart, slotEnd)) {
          freeNames.push(member.name);
        }
      }

      const acceptedPlansInSlot = acceptedPlans.filter((plan) => {
        const planStart = new Date(plan.startTime).getTime();
        const planEnd = new Date(plan.endTime).getTime();
        return (
          Number.isFinite(planStart) &&
          Number.isFinite(planEnd) &&
          planStart < slotEnd &&
          planEnd > slotStart
        );
      });

      const goingRSVPsInSlot = goingRSVPEvents.filter((evt) => {
        const evtStart = new Date(evt.startTime).getTime();
        const evtEnd = new Date(evt.endTime).getTime();
        return (
          Number.isFinite(evtStart) &&
          Number.isFinite(evtEnd) &&
          evtStart < slotEnd &&
          evtEnd > slotStart
        );
      });

      return {
        freeCount: freeNames.length,
        totalMembers: members.length,
        freeNames,
        acceptedPlans: acceptedPlansInSlot,
        goingRSVPEvents: goingRSVPsInSlot,
      };
    }),
  );
}

function formatSlotTitle(day: Date, hour: number, slot: SlotInfo) {
  const header = `${formatDayHeader(day).day} ${formatHour(hour)}-${formatHour(hour + 1)}: ${slot.freeCount}/${slot.totalMembers} available`;
  const parts: string[] = [header];
  if (slot.acceptedPlans.length > 0) {
    const planLabel = slot.acceptedPlans.length === 1 ? "Accepted plan" : "Accepted plans";
    parts.push(`${planLabel}: ${slot.acceptedPlans.map(formatPlanSummary).join(", ")}`);
  }
  if (slot.goingRSVPEvents.length > 0) {
    const rsvpLabel = slot.goingRSVPEvents.length === 1 ? "Going RSVP" : "Going RSVPs";
    parts.push(`${rsvpLabel}: ${slot.goingRSVPEvents.map((e) => e.title).join(", ")}`);
  }
  return parts.join(". ");
}

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  chatId,
  collapsed = false,
  focused = false,
  onToggle,
}) => {
  const { data, loading, error, refresh } = useHeatmapAvailability(chatId);
  const [hoveredSlot, setHoveredSlot] = useState<{
    dayIdx: number;
    hourIdx: number;
  } | null>(null);

  const days = useMemo(
    () => (data ? getDaysInRange(data.dateRange.start, data.dateRange.end) : []),
    [data],
  );

  const grid = useMemo(
    () => (data ? computeGrid(data.members, data.acceptedPlans, data.goingRSVPEvents ?? [], days) : []),
    [data, days],
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 shrink-0 gap-3 p-4">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Loading availability...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 shrink-0 gap-3 p-4">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 shrink-0 gap-3 p-4">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          No members found
        </p>
      </div>
    );
  }

  const maxFree = Math.min(data.memberCount, 6);

  const header = (
    <div className="flex items-center justify-between">
      <RightPanelToggle
        collapsed={collapsed}
        focused={focused}
        onToggle={onToggle}
      >
        My Availability
      </RightPanelToggle>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => void refresh()}
        disabled={loading}
        aria-label="Refresh availability"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
        />
      </Button>
    </div>
  );

  if (collapsed) {
    return (
      <div className="flex flex-col p-3 gap-1 shrink-0">
        {header}
        <p className="text-[10px] text-muted-foreground">
          {data
            ? `Your calendar · ${days.length} days`
            : "Click to expand"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 shrink min-h-0 flex-col gap-2 overflow-auto p-3">
      {header}

      {error && (
        <p className="text-xs text-muted-foreground">{error}</p>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid min-w-max gap-px"
          style={{
            gridTemplateColumns: `3rem repeat(${days.length}, minmax(2.75rem, 1fr))`,
          }}
        >
          {/* Header row: empty corner + day labels */}
          <div />
          {days.map((day, dayIdx) => {
            const hdr = formatDayHeader(day);
            return (
              <div
                key={dayIdx}
                className="text-center py-1 select-none"
              >
                <div className="text-[10px] font-medium text-muted-foreground leading-tight">
                  {hdr.day}
                </div>
                <div className="text-[10px] text-muted-foreground/70 leading-tight">
                  {hdr.date}
                </div>
              </div>
            );
          })}

          {/* Grid rows: hour label + cells per day */}
          {HOURS.map((hour, hourIdx) => (
            <Fragment key={`row-${hour}`}>
              <div
                className="text-[10px] text-muted-foreground text-right pr-1.5 flex items-center justify-end select-none"
              >
                {formatHour(hour)}
              </div>
              {days.map((_, dayIdx) => {
                const slot = grid[dayIdx]?.[hourIdx];
                if (!slot) return <div key={`${dayIdx}-${hourIdx}`} />;

                const colorIdx = Math.min(slot.freeCount, 6);
                const isHovered =
                  hoveredSlot?.dayIdx === dayIdx &&
                  hoveredSlot?.hourIdx === hourIdx;

                return (
                  <Tooltip key={`${dayIdx}-${hourIdx}`}>
                    <TooltipTrigger asChild>
                      <div
                        className="relative min-h-[1.25rem] rounded-[3px] transition-all duration-100 cursor-default"
                        style={{
                          backgroundColor: HEATMAP_COLORS[colorIdx],
                          boxShadow: slot.acceptedPlans.length > 0 && slot.goingRSVPEvents.length > 0
                            ? "inset 0 0 0 2px var(--primary), inset 0 0 0 4px #22c55e"
                            : slot.acceptedPlans.length > 0
                              ? "inset 0 0 0 2px var(--primary)"
                              : slot.goingRSVPEvents.length > 0
                                ? "inset 0 0 0 2px #22c55e"
                                : undefined,
                          outline: isHovered
                            ? "2px solid var(--ring)"
                            : undefined,
                          outlineOffset: isHovered ? "-1px" : undefined,
                        }}
                        title={formatSlotTitle(days[dayIdx], hour, slot)}
                        onMouseEnter={() =>
                          setHoveredSlot({ dayIdx, hourIdx })
                        }
                        onMouseLeave={() => setHoveredSlot(null)}
                      >
                        {slot.acceptedPlans.length > 0 && (
                          <span className="absolute inset-x-0 bottom-0.5 flex items-center justify-center gap-0.5 text-[10px] leading-none">
                            {slot.acceptedPlans
                              .slice(0, MAX_VISIBLE_PLAN_ICONS)
                              .map((plan) => (
                                <span key={`${plan.pollId}-${plan.eventId}`} aria-hidden="true">
                                  {getPlanIcon(plan)}
                                </span>
                              ))}
                            {slot.acceptedPlans.length > MAX_VISIBLE_PLAN_ICONS && (
                              <span className="rounded bg-background/85 px-0.5 text-[8px] font-semibold text-foreground shadow-sm">
                                +{slot.acceptedPlans.length - MAX_VISIBLE_PLAN_ICONS}
                              </span>
                            )}
                          </span>
                        )}
                        {slot.goingRSVPEvents.length > 0 && (
                          <span
                            className="absolute top-0 right-0.5 text-[8px] font-bold leading-none"
                            style={{ color: "#22c55e" }}
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={4}>
                      <div className="text-center">
                        <div className="font-medium">
                          {slot.freeCount}/{slot.totalMembers} available
                        </div>
                        <div className="text-[10px] opacity-80">
                          {formatDayHeader(days[dayIdx]).day}{" "}
                          {formatHour(hour)}–{formatHour(hour + 1)}
                        </div>
                        {slot.freeNames.length > 0 && (
                          <div className="text-[10px] opacity-70 mt-0.5">
                            {slot.freeNames.join(", ")}
                          </div>
                        )}
                        {slot.acceptedPlans.length > 0 && (
                          <div className="mt-1 border-t border-border/60 pt-1 text-left">
                            <div className="text-[10px] font-medium opacity-90">
                              {slot.acceptedPlans.length === 1
                                ? "Accepted plan"
                                : "Accepted plans"}
                            </div>
                            {slot.acceptedPlans.map((plan) => (
                              <div
                                key={`${plan.pollId}-${plan.eventId}`}
                                className="text-[10px] opacity-70"
                              >
                                <div className="font-medium opacity-90">
                                  {getPlanIcon(plan)} {plan.title}
                                </div>
                                <div>
                                  {[
                                    plan.chatTitle,
                                    formatPlanTimeRange(plan),
                                    formatPlanLocation(plan),
                                    formatEventSourceLabel(plan.source),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {slot.goingRSVPEvents.length > 0 && (
                          <div className="mt-1 border-t border-border/60 pt-1 text-left">
                            <div className="text-[10px] font-medium opacity-90">
                              {slot.goingRSVPEvents.length === 1 ? "Going RSVP" : "Going RSVPs"}
                            </div>
                            {slot.goingRSVPEvents.map((evt) => (
                              <div key={evt.eventId} className="text-[10px] opacity-70">
                                <div className="font-medium opacity-90">✅ {evt.title}</div>
                                <div>{formatEventSourceLabel(evt.source)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">None</span>
          <div className="flex flex-1 gap-px">
            {Array.from({ length: maxFree + 1 }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-2.5 rounded-sm first:rounded-l last:rounded-r"
                style={{ backgroundColor: HEATMAP_COLORS[i] }}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">All</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px]" aria-hidden="true">👥</span>
          <span className="text-[10px] text-muted-foreground">Accepted plan</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] font-bold leading-none" style={{ color: "#22c55e" }} aria-hidden="true">✓</span>
          <span className="text-[10px] text-muted-foreground">Going RSVP</span>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityHeatmap;
