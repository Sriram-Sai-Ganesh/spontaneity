import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "delete expired events",
  { hourUTC: 0, minuteUTC: 0 },
  internal.events_mutations.deleteExpiredEvents,
);

crons.daily(
  "delete expired custom events",
  { hourUTC: 0, minuteUTC: 0 },
  internal.custom_events_mutations.deleteExpiredCustomEvents,
);

crons.daily(
  "delete expired non-ticket places",
  { hourUTC: 0, minuteUTC: 0 },
  internal.non_ticket_events_mutations.deleteExpiredNonTicketPlaces,
);

crons.daily(
  "send recurring instance reminder emails",
  { hourUTC: 1, minuteUTC: 0 },
  internal.email_notifications.checkAndSendRecurringEventReminders,
);

export default crons;