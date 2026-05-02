import "@/styles/index.css"; // Keep this line at the top so richColors can be used in the Toaster
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Router } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { convex } from "@/lib/convex";
import App from "./App.tsx";

const rawBase = import.meta.env.BASE_URL;
const normalizedBase = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");
const basePath =
  typeof window !== "undefined" &&
  normalizedBase &&
  window.location.pathname.startsWith(normalizedBase)
    ? normalizedBase
    : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router base={basePath}>
      <ConvexAuthProvider client={convex}>
        <App />
        <Toaster richColors position="top-center" />
      </ConvexAuthProvider>
    </Router>
  </StrictMode>,
);
