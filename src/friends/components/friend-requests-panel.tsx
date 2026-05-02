import { useMutation, useQuery } from "convex/react";
import { Check, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";

const FriendRequestsPanel: React.FC = () => {
  const incoming = useQuery(api.friends_queries.getIncomingRequests);
  const friends = useQuery(api.friends_queries.getFriends);
  const acceptRequest = useMutation(api.friends_mutations.acceptRequest);
  const rejectRequest = useMutation(api.friends_mutations.rejectRequest);

  return (
    <div className="flex flex-col">
      {/* Incoming Requests */}
      <div className="px-3 py-2 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Friend Requests
        </p>
      </div>

      {incoming === undefined ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">Loading…</div>
      ) : incoming.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          No pending requests
        </div>
      ) : (
        <ul className="flex flex-col divide-y">
          {incoming.map((req) => {
            const name = req.sender.name ?? req.sender.email ?? "Unknown";
            const letter = name[0]?.toUpperCase() ?? "?";
            return (
              <li key={req._id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={req.sender.image ?? undefined} alt={name} />
                  <AvatarFallback>{letter}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium truncate">{name}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                    aria-label={`Accept friend request from ${name}`}
                    onClick={() => void acceptRequest({ requestId: req._id })}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Decline friend request from ${name}`}
                    onClick={() => void rejectRequest({ requestId: req._id })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Friends List */}
      <div className="px-3 py-2 border-t border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Friends{friends !== undefined ? ` · ${friends.length}` : ""}
        </p>
      </div>

      {friends === undefined ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">Loading…</div>
      ) : friends.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
          <Users className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No friends yet</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y max-h-48 overflow-y-auto">
          {friends.map((f) => {
            const name = f.friend.name ?? f.friend.email ?? "Unknown";
            const letter = name[0]?.toUpperCase() ?? "?";
            return (
              <li key={f._id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={f.friend.image ?? undefined} alt={name} />
                  <AvatarFallback>{letter}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm truncate">{name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FriendRequestsPanel;
