/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" when running Playwright E2E (see playwright.config.ts). */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
