/**
 * Stripe platform-key pool for the swarm (the rate-limit sharder).
 *
 * Stripe rate-limits per API KEY (the platform account), NOT per connected
 * account — requests "on behalf of" a sub-account (the `Stripe-Account` header)
 * count against the platform's bucket (~25 req/s in test mode). So N sub-accounts
 * under ONE platform key all share ONE bucket; creating more accounts does not
 * raise the ceiling.
 *
 * To actually multiply throughput, shard workers across MULTIPLE platform test
 * accounts (each its own key → its own bucket). Set `STRIPE_TEST_KEY_POOL` to a
 * comma-separated list of platform secret keys; workers are assigned round-robin
 * (`idx % pool.length`), so K keys give ~K× the aggregate Stripe rate limit.
 *
 * Hard constraint: a connected account belongs to exactly ONE platform, so a
 * worker's sub-account must be CREATED with the same pool key its server later
 * USES, and each platform key needs its own Connect webhook. The key index is
 * persisted with each sub-account (see {@link encodeSubAccount}) so teardown
 * deletes it under the owning key.
 *
 * Unset (or single value) → falls back to the lone `STRIPE_SANDBOX_SECRET_KEY`
 * (a pool of one): identical behavior to before.
 *
 * NOTE: the per-key Stripe CLIENT factory lives in the server package (which has
 * the `stripe` dependency — `scripts/` deliberately does not), re-exported below.
 */

export { stripeClientForKey } from "@server/external/connect/stripeFromKey.js";

import { isStripeConnectShardKey } from "./stripeConnectShard.ts";

export const STRIPE_POOL_ENV_VARS = [
	"STRIPE_TEST_KEY_POOL",
	"STRIPE_TEST_KEY_POOL_OLD",
] as const;

const splitKeys = (raw: string | undefined): string[] =>
	raw
		?.split(",")
		.map((key) => key.trim())
		.filter(Boolean) ?? [];

export const collectPoolKeys = (): string[] => {
	const seen = new Set<string>();
	const keys: string[] = [];

	for (const envVar of STRIPE_POOL_ENV_VARS) {
		for (const key of splitKeys(process.env[envVar])) {
			if (seen.has(key) || isStripeConnectShardKey(key)) continue;
			seen.add(key);
			keys.push(key);
		}
	}

	return keys;
};

export const resolvePoolKeys = (): string[] => {
	const fromPool = collectPoolKeys();
	if (fromPool.length > 0) {
		return fromPool;
	}
	const single = process.env.STRIPE_SANDBOX_SECRET_KEY?.trim();
	if (single && isStripeConnectShardKey(single)) {
		throw new Error(
			"STRIPE_SANDBOX_SECRET_KEY is reserved for the stripe-connect shard; set a pool key in STRIPE_TEST_KEY_POOL",
		);
	}
	if (single) {
		return [single];
	}
	throw new Error(
		`no Stripe key: set one of ${STRIPE_POOL_ENV_VARS.join(" / ")} (comma-separated) or STRIPE_SANDBOX_SECRET_KEY`,
	);
};

let poolCache: string[] | undefined;
const pool = (): string[] => {
	poolCache ??= resolvePoolKeys();
	return poolCache;
};

export const stripeKeyPoolSize = (): number => pool().length;

export const allPoolKeys = (): string[] => [...pool()];

export const restrictPoolTo = (keys: string[]): void => {
	if (keys.length > 0) {
		poolCache = keys;
	}
};

export const stripeKeyForWorker = (
	idx: number,
): { key: string; keyIndex: number } => {
	const keys = pool();
	const keyIndex = ((idx % keys.length) + keys.length) % keys.length;
	return { key: keys[keyIndex], keyIndex };
};

export const stripeKeyByIndex = (keyIndex: number): string => {
	const keys = pool();
	return keys[keyIndex] ?? keys[0];
};

const SUB_ACCOUNT_SEP = "::";

export const encodeSubAccount = (accountId: string, keyIndex: number): string =>
	`${accountId}${SUB_ACCOUNT_SEP}${keyIndex}`;

export const decodeSubAccount = (
	encoded: string,
): { accountId: string; keyIndex: number } => {
	const at = encoded.lastIndexOf(SUB_ACCOUNT_SEP);
	if (at === -1) {
		return { accountId: encoded, keyIndex: 0 };
	}
	const keyIndex = Number(encoded.slice(at + SUB_ACCOUNT_SEP.length));
	return {
		accountId: encoded.slice(0, at),
		keyIndex: Number.isFinite(keyIndex) ? keyIndex : 0,
	};
};

export const webhookKeyTag = (keyIndex: number): string =>
	`platform${SUB_ACCOUNT_SEP}${keyIndex}`;

export const keyIndexFromWebhookTag = (tag: string): number => {
	const at = tag.lastIndexOf(SUB_ACCOUNT_SEP);
	if (at === -1) {
		return 0;
	}
	const keyIndex = Number(tag.slice(at + SUB_ACCOUNT_SEP.length));
	return Number.isFinite(keyIndex) ? keyIndex : 0;
};
