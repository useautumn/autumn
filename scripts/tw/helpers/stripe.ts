/**
 * Orchestrator-side Stripe helpers for the `bun tw` cloud test swarm.
 *
 * Per bun-tw-plan.md §9a, the ORCHESTRATOR (not the worker) creates + registers
 * + records every Stripe resource before anything that can fail, so a worker
 * dying mid-bring-up can never orphan an untracked sub-account. The worker only
 * binds the returned `acct_*` id into its localhost DB (that half lives in the
 * server's `attachSandboxStripeAccount`, §6a).
 *
 * Everything here runs in the orchestrator process (it holds the platform key
 * `STRIPE_SANDBOX_SECRET_KEY`). The server modules are imported via `@server/*`
 * aliases (see scripts/tsconfig.json) and reused verbatim:
 *   - `createConnectAccount` mints the sub-account via `stripe.v2.core.accounts.create`
 *     (we pass the owner-tag `metadata` so the sweeper can find orphans).
 *   - `initMasterStripe` builds the platform / sub-account-scoped clients.
 *   - `deleteConnectedAccount` deletes a sub-account (drops its account-scoped
 *     webhook with it).
 *
 * See plan §6, §6a, §9a.
 */

import { AppEnv } from "@autumn/shared";
import { deleteConnectedAccount } from "@server/external/connect/connectUtils.js";
import { initMasterStripe } from "@server/external/connect/initStripeCli.js";
import type { Logger } from "@server/external/logtail/logtailUtils.js";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@server/external/stripe/common/stripeConstants.js";
import { createConnectAccount } from "@server/internal/orgs/orgUtils/createConnectAccount.js";
import type { User } from "better-auth";
import type { Organization } from "better-auth/plugins";
import pLimit from "p-limit";
import { STRIPE_SUBACCOUNT_CONCURRENCY, TW_ENV } from "../constants.js";
import type { OwnerTag } from "../types.js";
import { stripeMetadata } from "./owner.js";

/**
 * A minimal console-backed `Logger` for `deleteConnectedAccount`. The real
 * server logger pulls in pino + OTel at module load (and expects Infisical
 * secrets), which we don't want in the orchestrator; the connect util only ever
 * calls `.info`/`.error`, so a thin shim is enough.
 */
const orchestratorLogger: Logger = {
	debug: (...args: unknown[]) => console.debug(...args),
	info: (...args: unknown[]) => console.info(...args),
	warn: (...args: unknown[]) => console.warn(...args),
	error: (...args: unknown[]) => console.error(...args),
	child: () => orchestratorLogger,
};

/** All Stripe events the legacy webhook + sync middleware chain needs (plan §6a). */
const WEBHOOK_EVENTS = [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES];

/**
 * `accounts.create` is a PLATFORM-account write — creating N sub-accounts at once
 * gets the platform 429'd. Throttle to a low concurrency AND retry 429s with
 * exponential backoff + jitter (plan §6a "provisioning burst").
 */
const subAccountCreateLimit = pLimit(STRIPE_SUBACCOUNT_CONCURRENCY);

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
 * `createConnectAccount` only needs `org.name`; we never have a full
 * better-auth `Organization` on the orchestrator (the seeded org lives in the
 * worker's localhost DB), so accept just the fields the v2 create call reads.
 */
type SubAccountOrgInput = Pick<Organization, "name">;

/** `createConnectAccount` reads `user.email` for `contact_email`. */
type SubAccountUserInput = Pick<User, "email">;

/**
 * Create a Stripe Connect sub-account for one worker org, tagged with the run's
 * owner/run metadata so {@link sweepOrphans} can find it later. Returns the
 * `acct_*` id; the orchestrator records it in the run registry, then the worker
 * binds it into its localhost DB (plan §6a step 2, §9a).
 */
export const createSandboxSubAccount = async ({
	orgName,
	ownerEmail,
	owner,
	runId,
	orgId,
}: {
	orgName: string;
	ownerEmail: string;
	orgId: string;
} & OwnerTag): Promise<string> => {
	const org: SubAccountOrgInput = { name: orgName };
	const user: SubAccountUserInput = { email: ownerEmail };

	// Throttle + retry: bursting `accounts.create` across N workers 429s the
	// platform account (plan §6a provisioning burst).
	const account = await subAccountCreateLimit(() =>
		withRateLimitRetry(
			() =>
				createConnectAccount({
					// `createConnectAccount` only reads `org.name` / `user.email`; the full
					// better-auth shapes aren't available orchestrator-side.
					org: org as Organization,
					user: user as User,
					metadata: stripeMetadata(owner, runId, orgId),
				}),
			"accounts.create",
		),
	);

	return account.id;
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
): Promise<string> => {
	// PLATFORM client (no `accountId`/`stripeAccount`) — required for a
	// `connect: true` endpoint. A sub-account-scoped client is rejected by Stripe.
	const stripeCli = initMasterStripe({ env: AppEnv.Sandbox });

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
): Promise<void> => {
	try {
		const stripeCli = initMasterStripe({ env: AppEnv.Sandbox });
		await stripeCli.webhookEndpoints.del(webhookId);
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
export const deleteSubAccount = async (accountId: string): Promise<void> => {
	await deleteConnectedAccount({
		accountId,
		env: AppEnv.Sandbox,
		logger: orchestratorLogger,
	});
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
	const masterStripe = initMasterStripe({
		env: AppEnv.Sandbox,
		skipInstrumentation: true,
	});

	const cutoff = Date.now() - olderThanMs;
	const deleted: string[] = [];

	for await (const account of masterStripe.accounts.list({
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

		await deleteSubAccount(account.id);
		deleted.push(account.id);
	}

	return deleted;
};
