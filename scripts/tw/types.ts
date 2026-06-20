/**
 * Shared types for the `bun tw` cloud test swarm orchestrator.
 *
 * See bun-tw-plan.md (§3 architecture, §8 runner, §9/§9a lifecycle + cleanup,
 * §11a boot env) for the authoritative design these contracts encode.
 *
 * NOTE: the `TestExecutor` interface is intentionally NOT defined here. The
 * runner-refactor step owns it and exports it from `scripts/testScripts`
 * (alongside `runTestsV2.tsx`); `tw` imports it from there. Defining it in two
 * places would let the seam drift. See plan §8.2.
 */

import type { ProviderName } from "./helpers/provider.ts";

/** The Stripe/Svix env the swarm runs against. Workers run in `sandbox` env. */
export type TwEnv = "sandbox";

/**
 * Parsed arguments for a single `bun tw` run.
 *
 * `groupsOrPatterns` is the raw positional list (group names / suite names /
 * file globs) resolved against `server/tests/_groups/` exactly like `bun t`.
 * `workers` is the pool size `N` (→ `maxParallel`); `perWorker` is `K` (window
 * becomes `N*K`). `ref` is the git ref the warm snapshot checks out. `keep`
 * leaves the pool up for debugging (skip teardown).
 */
export type TwRunArgs = {
	groupsOrPatterns: string[];
	workers: number;
	perWorker: number;
	ref: string;
	keep: boolean;
	/** Skip the preflight git gate (dirty tree / unpushed HEAD). For debugging. */
	allowDirty: boolean;
	/** Serve the live web dashboard (WS, random port) + keep it up after the run. */
	dashboard: boolean;
	/** Cloud backend: "vercel" (default) or "modal" (`--provider=modal`). */
	provider: ProviderName;
};

/**
 * Run identity. `owner` is the OS username (`os.userInfo().username`), stamped
 * on every created resource so teammates sharing the Vercel project + the
 * single Stripe platform account never step on each other (plan §9a). `runId`
 * is a unique id per `bun tw` invocation.
 */
export type OwnerTag = {
	owner: string;
	runId: string;
};

/** Lifecycle status of a run in the registry (plan §9a). */
export type RunStatus = "running" | "completed" | "cancelled";

/**
 * One Stripe webhook endpoint registered on a worker's sub-account, recorded so
 * teardown can drop it explicitly if deleting the account doesn't cascade
 * (plan §9a teardown step 2).
 */
export type RegistryWebhook = {
	sandboxName: string;
	accountId: string;
	webhookId: string;
};

/** A sandbox tracked in the run registry (name is the cleanup key; id once known). */
export type RegistrySandbox = {
	name: string;
	id?: string;
};

/**
 * One run's authoritative cleanup record, persisted to
 * `~/.autumn-tw/registry.json` and written incrementally as resources are
 * created (plan §9a). This — not provider listing — is the primary source of
 * truth for `list`/`kill`; tags are the fallback when an entry is missing.
 */
export type RegistryEntry = {
	runId: string;
	owner: string;
	/** epoch ms */
	startedAt: number;
	status: RunStatus;
	ref: string;
	sandboxes: RegistrySandbox[];
	/** Stripe Connect sub-account ids (`acct_*`) created for this run. */
	subAccounts: string[];
	/** The single dedicated Svix shard's app id, if the run needed Svix (§7). */
	svixAppId?: string;
	webhooks: RegistryWebhook[];
};

/** The on-disk registry: one entry per `runId`. */
export type Registry = Record<string, RegistryEntry>;

/**
 * Live, in-memory handle to one provisioned worker the dispatcher schedules
 * against. `publicUrl` is `sandbox.domain(SERVER_PORT)` (the inbound Stripe
 * webhook target, plan §6a). `isSvixShard` marks the single dedicated Svix
 * worker (plan §7). `lastFile`/`busy` drive the sliding-window scheduling and
 * the "retry on a different worker" rule (plan §8.7).
 */
export type WorkerHandle = {
	name: string;
	sandboxId?: string;
	publicUrl: string;
	accountId?: string;
	isSvixShard: boolean;
	lastFile?: string;
	busy: boolean;
};

/**
 * Build-time partition of the selected test files: the Svix files routed onto
 * the single dedicated Svix shard vs. everything else on the general pool
 * (plan §7 detection + recommendation).
 */
export type ShardPlan = {
	svixFiles: string[];
	normalFiles: string[];
};
