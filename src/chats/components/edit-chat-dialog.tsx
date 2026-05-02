import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Sparkles, Loader2, UserPlus, Check, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChatType } from "@/chats/types/chat";
import { useMutationChat } from "@/chats/hooks/use-mutation-chat";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface MemberFriendButtonProps {
  userId: Id<"users">;
}

const MemberFriendButton: React.FC<MemberFriendButtonProps> = ({ userId }) => {
  const [isPending, setIsPending] = useState(false);
  const status = useQuery(api.friends_queries.getRelationshipStatus, {
    otherUserId: userId,
  });
  const sendRequest = useMutation(api.friends_mutations.sendRequest);
  const acceptRequest = useMutation(api.friends_mutations.acceptRequest);
  const incomingRequests = useQuery(api.friends_queries.getIncomingRequests);

  if (status === undefined) return null;
  if (status === "friends") return null;

  if (status === "request_sent") {
    return (
      <span className="text-xs text-muted-foreground ml-auto shrink-0">
        Requested
      </span>
    );
  }

  if (status === "request_received") {
    const request = incomingRequests?.find((r) => r.senderId === userId);
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="ml-auto shrink-0 h-7 px-2 text-xs"
        disabled={isPending || !request}
        onClick={async () => {
          if (!request) return;
          setIsPending(true);
          try {
            await acceptRequest({ requestId: request._id });
          } finally {
            setIsPending(false);
          }
        }}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3 mr-1" />
        )}
        Accept
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="ml-auto shrink-0 h-7 px-2 text-xs"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          await sendRequest({ receiverId: userId });
        } finally {
          setIsPending(false);
        }
      }}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <UserPlus className="h-3 w-3 mr-1" />
      )}
      Add
    </Button>
  );
};

interface EditChatDialogProps {
  chat: ChatType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MidpointCoordinates {
  latitude: number;
  longitude: number;
}

function coordinatesFromChat(chat: ChatType): MidpointCoordinates | null {
  return chat.midpointLatitude != null && chat.midpointLongitude != null
    ? { latitude: chat.midpointLatitude, longitude: chat.midpointLongitude }
    : null;
}

async function geocodeMidpoint(
  midpoint: string,
  planningLocation: string,
): Promise<MidpointCoordinates | null> {
  const geocodeQuery = planningLocation
    ? `${midpoint}, ${planningLocation}`
    : midpoint;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geocodeQuery)}&format=json&limit=1`,
    { headers: { "User-Agent": "Spontaneity-App" } },
  );
  const data = await res.json();
  const latitude = Number.parseFloat(String(data?.[0]?.lat ?? ""));
  const longitude = Number.parseFloat(String(data?.[0]?.lon ?? ""));
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

const EditChatDialog: React.FC<EditChatDialogProps> = ({
  chat,
  open,
  onOpenChange,
}) => {
  const [title, setTitle] = useState(chat.title);
  const [planningLocation, setPlanningLocation] = useState(
    chat.planningLocation ?? "",
  );
  const [icon, setIcon] = useState(chat.icon ?? "");
  const [useDistanceRanking, setUseDistanceRanking] = useState(
    chat.useDistanceRanking ?? false,
  );
  const [midpointLabel, setMidpointLabel] = useState(chat.midpointLabel ?? "");
  const [midpointCoordinates, setMidpointCoordinates] = useState<MidpointCoordinates | null>(
    coordinatesFromChat(chat),
  );
  const [midpointError, setMidpointError] = useState<string | null>(null);
  const [isGeocodingMidpoint, setIsGeocodingMidpoint] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const { edit: editChat } = useMutationChat(chat._id);
  // Use direct useQuery instead of useQueryMessages to avoid its unmount
  // disposal side-effect, which would wipe the shared message store for
  // still-mounted consumers (e.g., the active chat view).
  const chatMessages =
    useQuery(api.messages_queries.getByChat, {
      chatId: chat._id as Id<"chats">,
    }) ?? [];
  const memberProfiles =
    useQuery(api.chats_queries.getMemberProfiles, {
      chatId: chat._id as Id<"chats">,
    }) ?? [];
  const currentUser = useQuery(api.users_queries.me);
  const suggestTitle = useAction(api.chats_actions.suggestTitle);

  const canSuggest = chatMessages.length > 0;

  useEffect(() => {
    if (!open) return;
    setTitle(chat.title);
    setPlanningLocation(chat.planningLocation ?? "");
    setIcon(chat.icon ?? "");
    setUseDistanceRanking(chat.useDistanceRanking ?? false);
    setMidpointLabel(chat.midpointLabel ?? "");
    setMidpointCoordinates(coordinatesFromChat(chat));
    setMidpointError(null);
  }, [
    chat.icon,
    chat.midpointLabel,
    chat.midpointLatitude,
    chat.midpointLongitude,
    chat.planningLocation,
    chat.title,
    chat.useDistanceRanking,
    open,
  ]);

  const handleSuggestTitle = async () => {
    setIsSuggesting(true);
    try {
      const suggested = await suggestTitle({
        chatId: chat._id as Id<"chats">,
      });
      if (suggested) {
        setTitle(suggested);
      }
    } catch {
      // Suggestion failed — ignore silently
    }
    setIsSuggesting(false);
  };

  const resolveMidpointCoordinates = async (
    trimmedMidpoint: string,
    trimmedPlanningLocation: string,
  ): Promise<MidpointCoordinates | null> => {
    setIsGeocodingMidpoint(true);
    setMidpointError(null);
    try {
      const coordinates = await geocodeMidpoint(trimmedMidpoint, trimmedPlanningLocation);
      setMidpointCoordinates(coordinates);
      if (!coordinates) {
        setMidpointError(
          "We could not find that midpoint. Try a more specific place or neighborhood.",
        );
      }
      return coordinates;
    } catch {
      setMidpointCoordinates(null);
      setMidpointError(
        "We could not check that midpoint right now. Try again before saving.",
      );
      return null;
    } finally {
      setIsGeocodingMidpoint(false);
    }
  };

  const handleCheckMidpoint = async () => {
    const trimmedMidpoint = midpointLabel.trim();
    if (!trimmedMidpoint) {
      setMidpointCoordinates(null);
      setMidpointError(null);
      return;
    }
    await resolveMidpointCoordinates(trimmedMidpoint, planningLocation.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    const trimmedPlanningLocation = planningLocation.trim();
    if (!trimmed) return;
    const cleanedIcon = icon.trim().slice(0, 2) || null;
    const trimmedMidpoint = midpointLabel.trim();

    let midpointLatitude: number | null = null;
    let midpointLongitude: number | null = null;
    const midpointLabelValue: string | null = trimmedMidpoint || null;

    if (trimmedMidpoint) {
      const coordinates = await resolveMidpointCoordinates(
        trimmedMidpoint,
        trimmedPlanningLocation,
      );
      if (!coordinates) return;
      midpointLatitude = coordinates.latitude;
      midpointLongitude = coordinates.longitude;
    } else {
      setMidpointCoordinates(null);
      setMidpointError(null);
    }

    const success = await editChat({
      title: trimmed,
      icon: cleanedIcon,
      planningLocation: trimmedPlanningLocation || null,
      useDistanceRanking,
      midpointLatitude,
      midpointLongitude,
      midpointLabel: midpointLabelValue,
    });
    if (success) {
      onOpenChange(false);
    }
  };

  const midpointMapsUrl = midpointCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${midpointCoordinates.latitude},${midpointCoordinates.longitude}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Group name"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canSuggest || isSuggesting}
                onClick={handleSuggestTitle}
                title="Suggest title"
              >
                {isSuggesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>

            <Input
              value={planningLocation}
              onChange={(e) => {
                setPlanningLocation(e.target.value);
                if (midpointLabel.trim()) {
                  setMidpointCoordinates(null);
                  setMidpointError(null);
                }
              }}
              placeholder="Group Location (optional)"
              aria-label="Group Location"
              className="max-w-sm"
            />

            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <Input
                  value={midpointLabel}
                  onChange={(e) => {
                    setMidpointLabel(e.target.value);
                    setMidpointCoordinates(null);
                    setMidpointError(null);
                  }}
                  placeholder="Group midpoint, e.g. Fells Point (optional)"
                  aria-label="Group Midpoint"
                  className="text-sm"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCheckMidpoint}
                    disabled={!midpointLabel.trim() || isGeocodingMidpoint}
                    className="h-7 px-2 text-xs"
                  >
                    {isGeocodingMidpoint ? "Checking..." : "Check midpoint"}
                  </Button>
                  {midpointMapsUrl ? (
                    <a
                      href={midpointMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Distance restrictions and nearby ranking are measured from this point.
                </p>
                {midpointError ? (
                  <p className="text-xs text-destructive mt-1" role="alert">
                    {midpointError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Icon (emoji or 1-2 chars)"
                aria-label="Group icon"
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIcon("")}
              >
                Clear
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Preview:</span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-secondary">
                  {icon.trim() || "👥"}
                </span>
              </div>
            </div>

            <div className="border-t pt-4 mt-2">
              <h3 className="text-sm font-semibold mb-3">Members</h3>
              {memberProfiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No members yet.</p>
              ) : (
                <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {memberProfiles.map((member) => {
                    const displayName =
                      member.nickname || member.user?.name || "Member";
                    const secondary = [
                      member.user?.name && member.user?.name !== displayName
                        ? member.user?.name
                        : null,
                      member.role === "owner" ? "Owner" : "Member",
                    ]
                      .filter(Boolean)
                      .join(" • ");
                    const fallback =
                      displayName.trim().charAt(0).toUpperCase() || "?";

                    const isSelf = member.userId === currentUser?._id;

                    return (
                      <li key={member._id} className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarImage
                            src={member.user?.image ?? undefined}
                            alt={displayName}
                          />
                          <AvatarFallback>{fallback}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight truncate">
                            {displayName}
                          </p>
                          <p className="text-xs text-muted-foreground leading-tight truncate">
                            {secondary || "Member"}
                          </p>
                        </div>
                        {!isSelf && (
                          <MemberFriendButton
                            userId={member.userId as Id<"users">}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t pt-4 mt-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                onClick={() => setUseDistanceRanking(!useDistanceRanking)}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">Prefer nearby events</p>
                    <p className="text-xs text-muted-foreground">
                      Rank closer events higher based on group location
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "h-5 w-9 rounded-full transition-colors relative",
                    useDistanceRanking ? "bg-primary" : "bg-muted",
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
                      useDistanceRanking ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </div>
              </button>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isGeocodingMidpoint}>
              {isGeocodingMidpoint ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditChatDialog;
