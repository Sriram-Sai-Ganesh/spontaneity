import { useQuery } from "convex/react";
import { toast } from "sonner";
import { RotateCw, Clock, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RightPanelToggle } from "@/components/right-panel-toggle";
import { buildCalendarIcsPayload, buildMultiEventCalendarIcs, downloadCalendarIcs } from "@/lib/calendar-ics";
import { EventRSVPPanel } from "@/messages/components/event-rsvp-panel";
import { CreateRecurringEventDialog } from "./create-recurring-event-dialog";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";

interface RecurringEventsPanelProps {
  chatId: string;
  collapsed?: boolean;
  focused?: boolean;
  onToggle?: () => void;
}

export function RecurringEventsPanel({
  chatId,
  collapsed = false,
  focused = false,
  onToggle,
}: RecurringEventsPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const instances = useQuery(
    api.recurring_event_queries.getUpcomingRecurringInstances,
    { chatId: chatId as Id<"chats">, maxPerConfig: 1 },
  );

  const allInstances = useQuery(
    api.recurring_event_queries.getUpcomingRecurringInstances,
    { chatId: chatId as Id<"chats">, maxPerConfig: 52 },
  );

  const headerEl = (
    <div className="flex items-center justify-between gap-2">
      <RightPanelToggle
        collapsed={collapsed}
        focused={focused}
        onToggle={onToggle}
      >
        Recurring Events
      </RightPanelToggle>
      <Button
        variant="outline"
        size="sm"
        className="h-7 rounded-full px-2 text-xs"
        onClick={() => setDialogOpen(true)}
      >
        <RotateCw className="h-3 w-3 mr-1" />
        Manage
      </Button>
    </div>
  );

  if (collapsed) {
    return (
      <>
        <div className="flex flex-col p-3 gap-1 shrink-0">
          {headerEl}
          <p className="text-[10px] text-muted-foreground">
            {instances === undefined
              ? "Loading..."
              : instances.length > 0
                ? `${instances.length} upcoming`
                : "No recurring events"}
          </p>
        </div>
        <CreateRecurringEventDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          chatId={chatId}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 p-3 gap-2 overflow-y-auto">
        {headerEl}

        {instances === undefined && (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}

        {instances && instances.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-4">
            <RotateCw className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              No recurring events yet. Click Manage to set one up.
            </p>
          </div>
        )}

        {instances && instances.length > 0 && (
          <div className="space-y-2">
            {instances.map((instance, i) => {
              const instanceEventId = `recurring:${instance.configId}:${instance.instanceDate}`;
              const instanceStartTime = instance.startTime
                  ? `${instance.instanceDate}T${instance.startTime}:00`
                  : `${instance.instanceDate}T00:00:00`;
              const icsPayload = {
                eventId: instance.eventId,
                title: instance.title,
                startTime: instanceStartTime,
                description: `Recurring ${instance.cadence} event`,
                source: "recurring" as const,
              };
              return (
                <div
                  key={`${instance.configId}-${instance.instanceDate}-${i}`}
                  className="rounded-lg border p-2.5 text-xs"
                >
                  <p className="font-medium leading-tight">{instance.title}</p>
                  <p className="text-primary font-medium flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    Next:{" "}
                    {new Date(instanceStartTime).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {instance.startTime && (
                      <span>
                        {" "}at{" "}
                        {new Date(instanceStartTime).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground/70 capitalize mt-0.5">
                    Every{" "}
                    {instance.interval > 1 ? `${instance.interval} ` : ""}
                    {instance.cadence === "weekly" && instance.interval === 1
                      ? "week"
                      : instance.cadence}
                  </p>
                  <div className="flex gap-1 mt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        const payload = buildCalendarIcsPayload(icsPayload);
                        if (!payload) {
                          toast.error("Calendar file unavailable");
                          return;
                        }
                        downloadCalendarIcs(payload);
                        toast.success("Calendar file ready");
                      }}
                    >
                      <CalendarPlus className="h-3 w-3 mr-1" />
                      Next
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        const configInstances = (allInstances ?? [])
                          .filter((inst) => inst.configId === instance.configId)
                          .map((inst) => ({
                            eventId: inst.eventId,
                            title: inst.title,
                            startTime: inst.startTime
                              ? `${inst.instanceDate}T${inst.startTime}:00`
                              : `${inst.instanceDate}T00:00:00`,
                            description: `Recurring ${inst.cadence} event`,
                            source: "recurring" as const,
                          }));
                        const payload = buildMultiEventCalendarIcs(configInstances, instance.title);
                        if (!payload) {
                          toast.error("No upcoming instances to export");
                          return;
                        }
                        downloadCalendarIcs(payload);
                        toast.success("Calendar file ready");
                      }}
                    >
                      <CalendarPlus className="h-3 w-3 mr-1" />
                      All
                    </Button>
                  </div>
                  <EventRSVPPanel
                    eventId={instanceEventId}
                    chatId={chatId}
                    eventTitle={instance.title}
                    startTime={instanceStartTime}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <CreateRecurringEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        chatId={chatId}
      />
    </>
  );
}
