import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Main config that defines both frontend and convex test projects
export default defineConfig({
  // Make JSX handling explicit for component tests instead of depending on
  // tsconfig inference during Vitest collection.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    projects: [
      // Frontend tests
      {
        plugins: [react()],
        test: {
          name: "frontend",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["convex/**"],
          css: false,
          testTimeout: 15000,
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
      // Convex backend tests
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: {
            deps: {
              inline: ["convex-test"],
            },
          },
        },
      },
    ],
  },
});
