import vinext from "vinext";
import { defineConfig } from "vite";

// Titan's real Cloudflare D1 database (created directly in Melvin's own
// Cloudflare account — see titan-operations-db in the dashboard). This
// replaces the ChatGPT Sites-managed `.openai/hosting.json` indirection,
// which only existed to let that platform's control plane inject binding
// values at deploy time and is no longer needed now that this app deploys
// straight to Cloudflare.
const D1_DATABASE_ID = "cf54711f-f131-4aee-972b-187a88d8879b";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  name: "titan-operations-app",
  account_id: "85c84a0a40264ed2501062f2e9721524",
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      database_name: "titan-operations-db",
      database_id: D1_DATABASE_ID,
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
