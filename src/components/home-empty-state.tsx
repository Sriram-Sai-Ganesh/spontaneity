import { useLocation } from "wouter";
import { useQuery } from "convex/react";
import { MessageSquare, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutationChats } from "@/chats/hooks/use-mutation-chats";
import { api } from "../../convex/_generated/api";

const HomeEmptyState: React.FC = () => {
  const [, setLocation] = useLocation();
  const { add: createChat } = useMutationChats();
  const user = useQuery(api.users_queries.me);

  const firstName = user?.name?.split(" ")[0];

  const handleNewGroup = async () => {
    const chatId = await createChat({ title: "New Group" });
    if (chatId) {
      setLocation(`/groups/${chatId}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          Welcome to Spontaneity{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create a group to start planning together.
        </p>
      </div>
      <Button onClick={handleNewGroup}>
        <PlusCircle className="mr-2 h-4 w-4" />
        New Group
      </Button>
    </div>
  );
};

export default HomeEmptyState;
