import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, UsersRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useJoinGroup } from "@/groups/hooks/use-join-group";

interface JoinGroupPageProps {
  token: string;
}

const JoinGroupPage: React.FC<JoinGroupPageProps> = ({ token }) => {
  const [, setLocation] = useLocation();
  const { joinGroup } = useJoinGroup();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  // If the user presses enter, attempt join
  const handleJoin = async () => {
    if (!token) return;
    setLoading(true);
    const chatId = await joinGroup({ token, nickname });
    setLoading(false);
    if (chatId) {
      setLocation(`/groups/${chatId}`);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Join group</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Someone invited you to a Spontaneity group. Choose a nickname (optional)
          and join to see the chat.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">Nickname (optional)</label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Add a nickname for this group"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleJoin();
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" />
            Invite token: {token.slice(0, 8)}…
          </span>
          <span>Max 16 members</span>
        </div>
        <Button className="w-full" onClick={() => void handleJoin()} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…
            </>
          ) : (
            "Join group"
          )}
        </Button>
      </div>
    </div>
  );
};

export default JoinGroupPage;
