/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** If set, API base URL; otherwise use Vite dev proxy for `/api` (see vite.config.ts). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
