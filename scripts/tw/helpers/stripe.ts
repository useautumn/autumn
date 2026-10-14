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
	isKeyKnownHealthy,
	loadKeyHealthCache,
	saveHealthyKeys,
} from "./stripeKeyHealth.js";
import {
	allPoolKeys,
	decodeSubAccount,
	restrictPoolTo,
	stripeClientForKey,
	stripeKeyByIndex,
	stripeKeyPoolSize,
} from "./stripeKeyPool.js";
import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "./stripeRequestBudget.js";

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

const orchestratorLogger: Logger = {
	debug: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	info: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	warn: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	error: (...args: unknown[]) => sinkLine(`[connect] ${formatLogArgs(args)}`),
	child: () => orchestratorLogger,
};

const WEBHOOK_EVENTS = [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES];

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

export const createSandboxSubAccount = async ({
	orgName,
	ownerEmail,
	owner,
	runId,
	orgId,
	secretKey,
	extraMetadata,
}: {
	orgName: string;
	ownerEmail: string;
	orgId: string;
	secretKey: string;
	extraMetadata?: Record<string, string>;
} & OwnerTag): Promise<string> => {
	const stripe = stripeClientForKey(secretKey);

	const account = await getSubAccountCreateLimit()(() =>
		withRateLimitRetry(async () => {
			await paceCreate();
			return withStripeRequestSlot(() =>
				stripe.v2.core.accounts.create(
					{
						contact_email: ownerEmail,
						display_name: orgName,
						dashboard: "full",
						metadata: {
							...stripeMetadata(owner, runId, orgId),
							...extraMetadata,
						},
						identity: { country: "us" },
						configuration: { merchant: {} },
						defaults: {
							responsibilities: {
								losses_collector: "stripe",
								fees_collector: "stripe",
							},
						},
					},
					STRIPE_REQUEST_OPTIONS,
				),
			);
		}, "accounts.create"),
	);

	return account.id;
};

export const validateStripeKeyPool = async (): Promise<{
	usable: number;
	dropped: { keyPrefix: string; reason: string }[];
	probed: number;
}> => {
	const cache = loadKeyHealthCache();
	const probes = await Promise.all(
		allPoolKeys().map((key) => {
			if (isKeyKnownHealthy({ cache, key })) {
				return { key, ok: true as const, cached: true };
			}
			return withStripeRequestSlot(async () => {
				try {
					await stripeClientForKey(key).v2.core.accounts.list(
						{ limit: 1 },
						STRIPE_REQUEST_OPTIONS,
					);
					return { key, ok: true as const, cached: false };
				} catch (error) {
					return {
						key,
						ok: false as const,
						reason: (error as Error).message,
					};
				}
			});
		}),
	);

	const usable = probes.filter((probe) => probe.ok).map((probe) => probe.key);
	restrictPoolTo(usable);
	saveHealthyKeys({
		cache,
		healthyKeys: probes
			.filter((probe) => probe.ok && !probe.cached)
			.map((probe) => probe.key),
	});

	return {
		usable: usable.length,
		probed: probes.filter((probe) => !("cached" in probe && probe.cached))
			.length,
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
	// `connect: true` endpoint. One webhook is registered PER pool key, since each
	const stripeCli = stripeClientForKey(secretKey);

	const endpoint = await withStripeRequestSlot(() =>
		stripeCli.webhookEndpoints.create(
			{
				url: `${ingressUrl}/ingress/connect/${TW_ENV}`,
				enabled_events: WEBHOOK_EVENTS,
				connect: true,
			},
			STRIPE_REQUEST_OPTIONS,
		),
	);

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

export const deleteSubAccount = async (encoded: string): Promise<void> => {
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
		const SECONDS_TO_MS = 1000;
		return account.created * SECONDS_TO_MS;
	}

	return undefined;
};

export const sweepOrphans = async ({
	owner,
	olderThanMs,
}: {
	owner: string;
	olderThanMs: number;
}): Promise<string[]> => {
	const cutoff = Date.now() - olderThanMs;
	const deleted: string[] = [];

	for (let keyIndex = 0; keyIndex < stripeKeyPoolSize(); keyIndex++) {
		const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
		for await (const account of stripe.accounts.list({
			limit: STRIPE_LIST_PAGE_SIZE,
		})) {
			const metadata = account.metadata as Record<string, string> | null;
			if (metadata?.autumn_tw_owner !== owner) {
				continue;
			}
			if (metadata?.autumn_tw_pool === "1") {
				continue;
			}

			const createdAtMs = accountCreatedAtMs(account);
			if (createdAtMs === undefined || createdAtMs > cutoff) {
				continue;
			}

			try {
				await stripe.accounts.del(account.id);
				deleted.push(account.id);
			} catch {}
		}
	}

	return deleted;
};
