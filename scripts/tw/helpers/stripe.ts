/**
 * Orchestrator-side Stripe helpers for the `bun tw` cloud test swarm.
 *
 * Per bun-tw-plan.md §9a, the ORCHESTRATOR (not the worker) creates + registers
 * + records every Stripe resource before anything that can fail, so a worker
 * dying mid-bring-up can never orphan an untracked sub-account. The worker only
 * binds the returned `acct_*` id into its localhost DB (that half lives in the
 * server's `attachSandboxStripeAccount`, §6a).
 *
 * Everything here runs in the orchestrator process. It drives Stripe through a
 * POOL of platform keys (helpers/stripeKeyPool.ts) rather than one shared key:
 * Stripe rate-limits per platform key, so sharding workers across keys multiplies
 * the ceiling. Each call uses a per-key client (`stripeClientForKey`):
 *   - `createSandboxSubAccount` mints the sub-account via `stripe.v2.core.accounts.create`
 *     on a chosen pool key (owner-tag `metadata` lets the sweeper find orphans).
 *   - `registerConnectIngressWebhook` registers ONE platform Connect webhook per key.
 *   - `deleteSubAccount` deletes a sub-account under the key it was created on
 *     (the registry stores `acct_*::keyIndex`).
 *
 * See plan §6, §6a, §9a.
 */

import type { Logger } from "@server/external/logtail/logtailUtils.js";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@server/external/stripe/common/stripeConstants.js";
import pLimit from "p-limit";
import {
	STRIPE_SUBACCOUNT_CONCURRENCY,
	STRIPE_SUBACCOUNT_CREATE_SPACING_MS,
	TW_ENV,
} from "../constants.js";
import type { OwnerTag } from "../types.js";
import { sinkLine } from "./logSink.js";
import { stripeMetadata } from "./owner.js";
import {
	allPoolKeys,
	decodeSubAccount,
	restrictPoolTo,
	stripeClientForKey,
	stripeKeyByIndex,
	stripeKeyPoolSize,
} from "./stripeKeyPool.js";

/** Flatten a logger's varargs into one line (strings as-is; errors → message). */
const formatLogArgs = (args: unknown[]): string =>
	args
		.map((arg) => {
			if (typeof arg === "string") {
				return arg;
			}
			if (arg instanceof Error) {
				return arg.message;
			}
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(" ");

/**
 * A minimal `Logger` for `deleteConnectedAccount`. The real server logger pulls
 * in pino + OTel at module load (and expects Infisical secrets), which we don't
 * want in the orchestrator. Routes through the log sink so teardown chatter
 * (e.g. "Deleted account …") lands in the run log file / logs pane instead of
 * spamming the foreground during the run.
 */
const orchestratorLogger: Logger = {
	debug: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	info: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	warn: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	error: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	child: () => orchestratorLogger,
};

/** All Stripe events the legacy webhook + sync middleware chain needs (plan §6a). */
const WEBHOOK_EVENTS = [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES];

/**
 * `accounts.create` is a PLATFORM-account write — creating N sub-accounts at once
 * gets the platform 429'd. Throttle to a low concurrency AND retry 429s with
 * exponential backoff + jitter (plan §6a "provisioning burst").
 *
 * Lazily-built concurrency limiter so a `--stripe-concurrency=N` CLI flag (which
 * `index.ts` surfaces as the `STRIPE_SUBACCOUNT_CONCURRENCY` env var before the
 * run starts) is honored — a module-load-time `pLimit()` would capture the
 * default before the flag is applied.
 */
let subAccountCreateLimit: ReturnType<typeof pLimit> | undefined;
const getSubAccountCreateLimit = (): ReturnType<typeof pLimit> => {
	if (!subAccountCreateLimit) {
		const fromEnv = Number(process.env.STRIPE_SUBACCOUNT_CONCURRENCY);
		const concurrency =
			Number.isFinite(fromEnv) && fromEnv > 0
				? fromEnv
				: STRIPE_SUBACCOUNT_CONCURRENCY;
		subAccountCreateLimit = pLimit(concurrency);
	}
	return subAccountCreateLimit;
};

/**
 * Global creation pacer: regardless of concurrency, no two `accounts.create`
 * calls START closer than `STRIPE_SUBACCOUNT_CREATE_SPACING_MS` apart. This
 * smooths the provisioning burst so the platform account's rate-limit bucket
 * refills between writes.
 */
let nextCreateAt = 0;
const paceCreate = async (): Promise<void> => {
	const now = Date.now();
	const waitMs = Math.max(0, nextCreateAt - now);
	nextCreateAt =
		Math.max(now, nextCreateAt) + STRIPE_SUBACCOUNT_CREATE_SPACING_MS;
	if (waitMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
};

const isRateLimited = (error: unknown): boolean => {
	const e = error as { statusCode?: number; code?: string; type?: string };
	return (
		e?.statusCode === 429 ||
		e?.code === "rate_limit" ||
		e?.type === "StripeRateLimitError"
	);
};

const withRateLimitRetry = async <T>(
	fn: () => Promise<T>,
	label: string,
): Promise<T> => {
	const MAX_RETRIES = 6;
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (error) {
			if (!isRateLimited(error) || attempt >= MAX_RETRIES) {
				throw error;
			}
			const delayMs =
				Math.min(15_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
			console.warn(
				`[tw] Stripe rate-limited on ${label} — retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`,
			);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
};

/**
 * Create a Stripe Connect sub-account for one worker org under a SPECIFIC pool
 * key (`secretKey`), tagged with the run's owner/run metadata so
 * {@link sweepOrphans} can find it later. The account belongs to that key's
 * platform, so the worker's server must use the same key (see stripeKeyPool.ts).
 * Returns the `acct_*` id; the orchestrator records it (with the key index) in
 * the registry, then the worker binds it into its localhost DB (§6a/§9a).
 *
 * Mirrors the server's `createConnectAccount` v2 create body, but on a per-key
 * client so account creation shards across the pool (we never have a full
 * better-auth `Organization`/`User` orchestrator-side — the v2 call only reads
 * `display_name` / `contact_email`).
 */
export const createSandboxSubAccount = async ({
	orgName,
	ownerEmail,
	owner,
	runId,
	orgId,
	secretKey,
}: {
	orgName: string;
	ownerEmail: string;
	orgId: string;
	secretKey: string;
} & OwnerTag): Promise<string> => {
	const stripe = stripeClientForKey(secretKey);

	// Throttle + retry: bursting `accounts.create` across N workers 429s the
	// platform account (plan §6a provisioning burst).
	const account = await getSubAccountCreateLimit()(() =>
		withRateLimitRetry(async () => {
			await paceCreate();
			return stripe.v2.core.accounts.create({
				contact_email: ownerEmail,
				display_name: orgName,
				dashboard: "full",
				metadata: stripeMetadata(owner, runId, orgId),
				identity: { country: "us" },
				configuration: { merchant: {} },
				defaults: {
					responsibilities: {
						losses_collector: "stripe",
						fees_collector: "stripe",
					},
				},
			});
		}, "accounts.create"),
	);

	return account.id;
};

/**
 * Preflight the key pool: probe each key's v2 Connect account capability and DROP
 * the ones that can't (so workers aren't assigned to dead keys mid-fan-out). The
 * probe is a read (`v2.core.accounts.list`) which fails with "The API method
 * cannot be found." on platforms that don't have Connect / the v2 Accounts API
 * enabled — the exact gate that breaks {@link createSandboxSubAccount} — so no
 * throwaway accounts are created. Returns the usable count + the dropped keys (by
 * prefix + reason) for a clear report.
 */
export const validateStripeKeyPool = async (): Promise<{
	usable: number;
	dropped: { keyPrefix: string; reason: string }[];
}> => {
	const probes = await Promise.all(
		allPoolKeys().map(async (key) => {
			try {
				await stripeClientForKey(key).v2.core.accounts.list({ limit: 1 });
				return { key, ok: true as const };
			} catch (error) {
				return { key, ok: false as const, reason: (error as Error).message };
			}
		}),
	);

	const usable = probes.filter((probe) => probe.ok).map((probe) => probe.key);
	restrictPoolTo(usable);

	return {
		usable: usable.length,
		dropped: probes
			.filter((probe) => !probe.ok)
			.map((probe) => ({
				keyPrefix: `${probe.key.slice(0, 16)}…`,
				reason: "reason" in probe ? probe.reason : "unknown",
			})),
	};
};

/**
 * Register the ONE shared PLATFORM Connect webhook (`connect: true`, NO
 * `Stripe-Account` header) pointed at the ingress sandbox's connect route
 * `<ingressUrl>/ingress/connect/<env>`.
 *
 * WHY one shared webhook + an ingress: Stripe does NOT permit configuring webhook
 * endpoints ON a connected account ("You are not permitted to configure webhook
 * endpoints on a connected account"). The ONLY way to receive a connected
 * account's events is a platform Connect webhook routed by `event.account`. Stripe
 * caps webhook endpoints at 16/account, so a per-worker Connect webhook tops out
 * at ~16 workers. Instead the swarm registers ONE platform Connect webhook → the
 * ingress sandbox, which routes each event to exactly the owning worker by
 * `event.account` (scripts/tw/ingress/server.mjs). This removes the 16-worker cap
 * AND keeps full per-worker delivery isolation.
 *
 * Skip-verify is on (`STRIPE_WEBHOOK_SKIP_VERIFY=true`), so we don't store the
 * signing secret. Returns the endpoint id (recorded for teardown — the platform
 * Connect webhook is NOT cascade-deleted by sub-account deletion).
 */
export const registerConnectIngressWebhook = async (
	ingressUrl: string,
	secretKey: string,
): Promise<string> => {
	// PLATFORM client (no `accountId`/`stripeAccount`) — required for a
	// `connect: true` endpoint. One webhook is registered PER pool key, since each
	// platform key only delivers events for the accounts it owns.
	const stripeCli = stripeClientForKey(secretKey);

	const endpoint = await stripeCli.webhookEndpoints.create({
		url: `${ingressUrl}/ingress/connect/${TW_ENV}`,
		enabled_events: WEBHOOK_EVENTS,
		connect: true,
	});

	return endpoint.id;
};

/**
 * Delete the shared platform Connect webhook (idempotently — tolerates
 * "already deleted"). Unlike a sub-account's account-scoped webhook, the platform
 * Connect webhook is NOT cascade-deleted when its sub-accounts are deleted, so
 * teardown must drop it explicitly. Best-effort + time-boxed: logs and continues
 * on any error so it never blocks teardown.
 */
export const deleteConnectWebhook = async (
	webhookId: string,
	secretKey: string,
): Promise<void> => {
	try {
		await stripeClientForKey(secretKey).webhookEndpoints.del(webhookId);
	} catch (error) {
		console.warn(
			`[tw] failed to delete connect webhook ${webhookId} (continuing): ${(error as Error).message}`,
		);
	}
};

/**
 * Delete a sub-account (idempotently — tolerates "already deleted"). Deleting
 * the account drops its account-scoped webhook automatically (plan §9a). Reuses
 * the server's `deleteConnectedAccount`, which swallows errors and logs them, so
 * this is safe to call during best-effort, time-boxed teardown.
 */
export const deleteSubAccount = async (encoded: string): Promise<void> => {
	// The registry stores `acct_*::keyIndex`; the account belongs to that pool
	// key's platform, so it can only be deleted with that key.
	const { accountId, keyIndex } = decodeSubAccount(encoded);
	try {
		await stripeClientForKey(stripeKeyByIndex(keyIndex)).accounts.del(
			accountId,
		);
		orchestratorLogger.info(`Deleted account ${accountId} for sandbox`);
	} catch (error) {
		orchestratorLogger.error(`Failed to delete account ${accountId}`, error);
	}
};

const STRIPE_LIST_PAGE_SIZE = 100;

/**
 * Read an account's effective creation time (epoch ms). Prefers our own
 * `autumn_created_at` metadata stamp (set by {@link stripeMetadata}); falls back
 * to Stripe's `created` (epoch seconds) when the stamp is missing or unparseable.
 */
const accountCreatedAtMs = (account: {
	created?: number | null;
	metadata?: Record<string, string> | null;
}): number | undefined => {
	const stamped = account.metadata?.autumn_created_at;
	if (stamped) {
		const parsed = Number(stamped);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	if (typeof account.created === "number") {
		// Stripe `created` is epoch seconds.
		const SECONDS_TO_MS = 1000;
		return account.created * SECONDS_TO_MS;
	}

	return undefined;
};

/**
 * Tag-sweep fallback for SIGKILL'd runs (plan §9a `kill --orphans`): page through
 * the platform account's sub-accounts and delete every one this `owner` created
 * older than `olderThanMs`. Matches on `metadata.autumn_tw_owner === owner` so a
 * teammate's live swarm is never touched. Returns the deleted `acct_*` ids.
 */
export const sweepOrphans = async ({
	owner,
	olderThanMs,
}: {
	owner: string;
	olderThanMs: number;
}): Promise<string[]> => {
	const cutoff = Date.now() - olderThanMs;
	const deleted: string[] = [];

	// Orphans can live under ANY pool key's platform — sweep every key.
	for (let keyIndex = 0; keyIndex < stripeKeyPoolSize(); keyIndex++) {
		const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
		for await (const account of stripe.accounts.list({
			limit: STRIPE_LIST_PAGE_SIZE,
		})) {
			const metadata = account.metadata as Record<string, string> | null;
			if (metadata?.autumn_tw_owner !== owner) {
				continue;
			}

			const createdAtMs = accountCreatedAtMs(account);
			// Without a usable timestamp we can't prove the account is stale, so skip
			// it rather than risk deleting a live worker's sub-account.
			if (createdAtMs === undefined || createdAtMs > cutoff) {
				continue;
			}

			try {
				await stripe.accounts.del(account.id);
				deleted.push(account.id);
			} catch {
				// best-effort sweep — a failed delete is retried on the next sweep
			}
		}
	}

	return deleted;
};
