interface ToolCallData {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResultData {
  toolCallId: string;
  toolName: string;
  result: Record<string, unknown>;
}

interface MessageCreatedData {
  messageId: string;
}

interface StreamChatSSEOptions {
  siteUrl: string;
  token: string;
  chatId: string;
  model: string;
  openRouterApiKey?: string;
  signal?: AbortSignal;
  onChunk?: (accumulated: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (error: Error) => void;
  onToolCall?: (data: ToolCallData) => void;
  onToolResult?: (data: ToolResultData) => void;
  onMessageCreated?: (data: MessageCreatedData) => void;
}

/**
 * POST to the Convex HTTP endpoint and consume the SSE stream.
 */
export async function streamChatSSE({
  siteUrl,
  token,
  chatId,
  model,
  openRouterApiKey,
  signal,
  onChunk,
  onDone,
  onError,
  onToolCall,
  onToolResult,
  onMessageCreated,
}: StreamChatSSEOptions): Promise<void> {
  try {
    const response = await fetch(`${siteUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatId, model, openRouterApiKey }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";
    // Track the current event type from `event:` lines
    let currentEvent = "text-delta";
    // Buffer data lines for the current SSE event (multi-line data
    // uses multiple "data:" lines that must be joined with "\n").
    let eventDataLines: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          eventDataLines.push(line.slice(6));
        } else if (line === "") {
          // Blank line = end of SSE event — process buffered data lines
          if (eventDataLines.length > 0) {
            const eventData = eventDataLines.join("\n");
            eventDataLines = [];

            if (eventData === "[DONE]") {
              onDone?.(accumulated);
              return;
            }

            if (eventData.startsWith("[ERROR]: ")) {
              const errorMessage = eventData.slice(9);
              throw new Error(errorMessage);
            }

            switch (currentEvent) {
              case "text-delta":
                accumulated += eventData;
                onChunk?.(accumulated);
                break;
              case "tool-call":
                onToolCall?.(JSON.parse(eventData) as ToolCallData);
                break;
              case "tool-result":
                onToolResult?.(JSON.parse(eventData) as ToolResultData);
                break;
              case "message-created":
                onMessageCreated?.(JSON.parse(eventData) as MessageCreatedData);
                break;
            }

            // Reset event type for next event
            currentEvent = "text-delta";
          }
        }
      }
    }

    // Stream ended without [DONE] — treat accumulated as final
    onDone?.(accumulated);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return;
    }
    onError?.(error as Error);
  }
}
