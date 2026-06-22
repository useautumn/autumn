/**
 * Ownership + run-identity tagging for the `bun tw` cloud test swarm.
 *
 * Every resource the swarm creates (Vercel sandbox, Stripe sub-account, Svix
 * app) is stamped with the OS user + a per-invocation `runId` so teammates
 * sharing the Vercel project and the single Stripe platform account never step
 * on each other, and so a machine that dies mid-run leaves everything
 * recoverable via tags. See bun-tw-plan.md §9a.
 *
 * This module runs in the orchestrator (a normal node/bun process), NOT in a
 * workflow sandbox, so `Date.now()` / `Math.random()` are allowed.
 */

import { userInfo } from "node:os";

/** Characters allowed in an owner tag / sandbox name segment. */
const OWNER_ALLOWED = /[^a-z0-9-]/g;
/** Collapse runs of dashes left behind by sanitization. */
const DASH_RUNS = /-+/g;
/** Trim leading/trailing dashes. */
const EDGE_DASHES = /^-+|-+$/g;

const FALLBACK_OWNER = "unknown";

/** Base36 char count for the random suffix on a run id. */
const RUN_SUFFIX_LENGTH = 6;
const RUN_SUFFIX_RADIX = 36;

const sanitize = (value: string): string =>
	value
		.toLowerCase()
		.replace(OWNER_ALLOWED, "-")
		.replace(DASH_RUNS, "-")
		.replace(EDGE_DASHES, "");

/**
 * The OS username, sanitized to `[a-z0-9-]`. Prefers `os.userInfo().username`,
 * falling back to `$USER` / `$USERNAME`, then a constant so tagging never
 * throws. Plan §9a ("read the OS username once").
 */
export const getOwner = (): string => {
	let raw = "";
	try {
		raw = userInfo().username ?? "";
	} catch {
		// userInfo() can throw if there's no passwd entry (e.g. some containers);
		// fall through to the env-var fallbacks below.
		raw = "";
	}

	if (!raw) {
		raw = process.env.USER ?? process.env.USERNAME ?? "";
	}

	const sanitized = sanitize(raw);
	return sanitized || FALLBACK_OWNER;
};

/**
 * A unique id per `bun tw` invocation: a millisecond timestamp plus a short
 * random base36 suffix to disambiguate runs started in the same millisecond.
 */
export const newRunId = (): string => {
	const suffix = Math.random()
		.toString(RUN_SUFFIX_RADIX)
		.slice(2, 2 + RUN_SUFFIX_LENGTH)
		.padEnd(RUN_SUFFIX_LENGTH, "0");
	return `${Date.now().toString(RUN_SUFFIX_RADIX)}-${suffix}`;
};

/**
 * Vercel sandbox `name` for worker `idx` of a run: `tw-<owner>-<runId>-<idx>`.
 * Names are unique per Vercel project, so this doubles as a cleanup key and the
 * `kill --orphans` prefix-sweep selector. Plan §9a.
 */
export const sandboxName = (
	owner: string,
	runId: string,
	idx: number,
): string => `tw-${owner}-${runId}-${idx}`;

/** Vercel sandbox tags stamped on every worker. Plan §9a. */
export const vercelTags = (
	owner: string,
	runId: string,
): { owner: string; run: string; kind: "bun-tw" } => ({
	owner,
	run: runId,
	kind: "bun-tw",
});

/**
 * Stripe sub-account metadata. Extends the §6a GC tag (`autumn_test`) with the
 * owner/run/org provenance used by `kill --orphans` and `list`. Plan §9a.
 */
export const stripeMetadata = (
	owner: string,
	runId: string,
	orgId: string,
): {
	autumn_test: "true";
	autumn_tw_owner: string;
	autumn_tw_run: string;
	autumn_org_id: string;
	autumn_created_at: string;
} => ({
	autumn_test: "true",
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
	autumn_org_id: orgId,
	autumn_created_at: String(Date.now()),
});

/** Svix app metadata stamped on the single dedicated Svix shard's app. Plan §9a. */
export const svixMetadata = (
	owner: string,
	runId: string,
): { autumn_tw_owner: string; autumn_tw_run: string } => ({
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
});
