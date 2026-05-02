// Quick test to verify AI SDK v6 tool calling works with Zod v4
// Usage: OPENROUTER_API_KEY=sk-... node test-tools.mjs

import { streamText, tool, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY env var");
  process.exit(1);
}

const openrouter = createOpenRouter({ apiKey });

const weatherTools = {
  getLocation: tool({
    description:
      "Given a city name, returns the location with latitude and longitude coordinates",
    inputSchema: z.object({
      city: z.string().describe("City name, e.g. Baltimore"),
    }),
    execute: async ({ city }) => {
      console.log("[tool] getLocation called with:", city);
      return { name: city, latitude: 39.29, longitude: -76.61 };
    },
  }),
  getCurrentWeather: tool({
    description:
      "Given latitude and longitude coordinates, returns the current weather conditions",
    inputSchema: z.object({
      latitude: z.number().describe("Latitude coordinate"),
      longitude: z.number().describe("Longitude coordinate"),
    }),
    execute: async ({ latitude, longitude }) => {
      console.log("[tool] getCurrentWeather called with:", latitude, longitude);
      return { temperature: 45, unit: "°F", description: "Partly cloudy" };
    },
  }),
};

console.log("Starting streamText with tools...");
const result = streamText({
  model: openrouter.chat("anthropic/claude-sonnet-4-5"),
  messages: [{ role: "user", content: "What's the weather in Baltimore?" }],
  tools: weatherTools,
  stopWhen: stepCountIs(5),
  system:
    "You are a helpful assistant. When the user asks about weather, use the provided tools to look up weather information. Always call getLocation first to get the latitude and longitude, then use those coordinates with getCurrentWeather.",
  onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
    console.log("[step]", {
      finishReason,
      toolCalls: toolCalls?.length ?? 0,
      toolResults: toolResults?.length ?? 0,
      textLen: text?.length ?? 0,
    });
  },
});

let fullText = "";
for await (const part of (await result).fullStream) {
  switch (part.type) {
    case "text-delta":
      process.stdout.write(part.text);
      fullText += part.text;
      break;
    case "tool-call":
      console.log("\n[stream] tool-call:", part.toolName, part.input);
      break;
    case "tool-result":
      console.log("[stream] tool-result:", part.toolName, part.output);
      break;
  }
}
console.log("\n\nDone. Full text length:", fullText.length);
