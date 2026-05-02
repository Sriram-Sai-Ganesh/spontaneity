import { useState } from "react";
import { ArrowDownUp, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AddChatDialog from "@/chats/components/add-chat-dialog";
import ChatList from "@/chats/components/chat-list";

interface ListChatsPageProps {
  activeChatId?: string;
}

const ListChatsPage: React.FC<ListChatsPageProps> = ({ activeChatId }) => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none p-3 md:p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Groups</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Group
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            onClick={() =>
              setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
            }
            aria-label={
              sortOrder === "desc" ? "Sort oldest first" : "Sort newest first"
            }
          >
            <ArrowDownUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-3 md:p-4 overflow-auto">
        <ChatList
          activeChatId={activeChatId}
          searchQuery={searchQuery}
          sortOrder={sortOrder}
        />
      </div>
      <AddChatDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </div>
  );
};

export default ListChatsPage;
