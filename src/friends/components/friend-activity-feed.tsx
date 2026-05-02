import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "../../../convex/_generated/api";

type ActivityItem = {
  _id: string;
  activityType: "accepted_friend" | "rsvp_going";
  metadata: {
    eventId?: string;
    eventTitle?: string;
    chatId?: string;
  };
  createdAt: number;
  actor: {
    _id: string;
    name?: string;
    image?: string;
  };
};

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function activityText(item: ActivityItem): string {
  if (item.activityType === "rsvp_going") {
    const title = item.metadata.eventTitle;
    return title ? `is going to ${title}` : "RSVP'd to an event";
  }
  return "added a new friend";
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const name = item.actor.name ?? "Someone";
  const initial = name[0]?.toUpperCase() ?? "?";

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarImage src={item.actor.image ?? undefined} alt={name} />
        <AvatarFallback className="text-xs">{initial}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-sm leading-snug">
          <span className="font-medium">{name}</span>{" "}
          <span className="text-muted-foreground">{activityText(item)}</span>
        </p>
        <span className="text-xs text-muted-foreground/70">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>
    </li>
  );
}

const FriendActivityFeed: React.FC = () => {
  const activities = useQuery(
    api.friend_activity_queries.getRecentFriendActivity,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Friend Activity
        </p>
      </div>

      {activities === undefined ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <Users className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No recent friend activity
          </p>
          <p className="text-xs text-muted-foreground/70">
            Activity from your friends will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y overflow-y-auto flex-1 min-h-0">
          {(activities as ActivityItem[]).map((item) => (
            <ActivityRow key={item._id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default FriendActivityFeed;
