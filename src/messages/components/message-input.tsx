import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/prompt-kit/prompt-input";
import { Send, Square } from "lucide-react";

interface MessageInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (content: string) => void | Promise<void>;
  isLoading?: boolean;
  onAbort?: () => void;
  assistantChat?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onValueChange,
  onSend,
  isLoading,
  onAbort,
  assistantChat = false,
}) => {
  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    void onSend(trimmed);
  };

  return (
    <div className="p-4 max-w-3xl mx-auto w-full">
      <PromptInput
        value={value}
        onValueChange={onValueChange}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className="px-3 py-2"
      >
        <div className="flex items-end gap-2">
          <PromptInputTextarea
            placeholder={
              assistantChat ? "Message Spontaneity AI..." : "Ask anything..."
            }
            autoFocus
            className="min-h-8 py-2"
          />
          <PromptInputActions className="shrink-0 justify-end">
            {isLoading ? (
              <PromptInputAction tooltip="Stop generating">
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Stop generating"
                  onClick={onAbort}
                >
                  <Square className="h-4 w-4" />
                </Button>
              </PromptInputAction>
            ) : (
              <PromptInputAction tooltip="Send message">
                <Button
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Send message"
                  onClick={handleSubmit}
                  disabled={!value.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </PromptInputAction>
            )}
          </PromptInputActions>
        </div>
      </PromptInput>
      <p className="text-xs text-muted-foreground text-center pt-2">
        {assistantChat ? (
          "Messages here go directly to Spontaneity AI."
        ) : (
          <>
            Type <span className="font-semibold">@ai</span> to loop in the
            assistant.
          </>
        )}
      </p>
    </div>
  );
};

export default MessageInput;
