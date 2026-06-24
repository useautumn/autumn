// export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4-6";
export const DEFAULT_CHAT_MODEL = "anthropic/claude-opus-4-6";

// Cheap/fast model for the throwaway env classifier (sandbox vs live) — it doesn't
// need a frontier model.
export const DEFAULT_CHAT_ENV_MODEL = "anthropic/claude-haiku-4-5";
export const DEFAULT_CHAT_ORG_MODEL = "anthropic/claude-sonnet-4-6";

export const leafChatAgentDefaults = {
	maxSteps: 8,
	model: DEFAULT_CHAT_MODEL,
} as const;

// Keep this file env-free: evals import it, and lib/env.ts requires secrets at parse time.

/**
 * CMA persistent memory store (per org/env). Off while we get the billing
 * basics right; flip to true to re-enable cross-thread memory.
 */
export const claudeManagedMemoryEnabled = false;

/** "mastra" = the Mastra leaf agent loop; "claude-managed" = the Claude Managed Agents engine;
 * "vercel" = the AI SDK HarnessAgent running inside a Vercel Sandbox. */
export type AgentHarnessName = "claude-managed" | "mastra" | "vercel";

/** Which AI SDK harness adapter the "vercel" engine runs inside the sandbox.
 * Swap this to change runtimes; only "claudeCode" is wired today. */
export type VercelHarnessAdapter = "claudeCode" | "codex" | "pi";
export const VERCEL_HARNESS_ADAPTER: VercelHarnessAdapter = "claudeCode";

/** Which sandbox the AI SDK harness runs inside. The harness is sandbox-agnostic
 * (HarnessV1SandboxProvider), so this swaps the underlying compute. */
export type SandboxProviderName = "vercel" | "daytona" | "e2b";
export const SANDBOX_PROVIDER: SandboxProviderName = "vercel";

export const DEFAULT_SLACK_AGENT_HARNESS: AgentHarnessName = "claude-managed";
export const DEFAULT_WEB_AGENT_HARNESS: AgentHarnessName = "mastra";
export const DEFAULT_AGENT_HARNESS = DEFAULT_SLACK_AGENT_HARNESS;

/**
 * Which harness evals run through when the eval file passes no driver; EVAL_DRIVER env overrides.
 * Per-harness suites pass their driver explicitly (e.g. tests/evals/claudeManaged/).
 */
export const DEFAULT_EVAL_DRIVER: AgentHarnessName = "claude-managed";

/** End-to-end per-message timeout; the in-process Agent SDK loop spawns a subprocess, so more headroom. */
export const messageTimeoutMs: Record<AgentHarnessName, number> = {
	"claude-managed": 120_000,
	mastra: 60_000,
	vercel: 120_000,
};
