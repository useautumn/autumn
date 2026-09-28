import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { and, eq, like, notInArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	forgetKeySecretsExcept,
	hashKey,
	keyHint,
	rememberKeySecret,
} from "../keySecrets.ts";
import { stripeForKey } from "../stripeForKey.ts";

const PROBE_CONCURRENCY = 8;
export const UNRESOLVED_KEY_PREFIX = "unresolved:";

/** Same fields scripts/tw/probe-stripe-keys.ts prints for a failing key. */
const describeStripeError = (error: unknown): string => {
	const e = error as {
		message?: string;
		type?: string;
		code?: string;
		statusCode?: number;
		requestId?: string;
	};
	const parts = [
		e?.type && `type=${e.type}`,
		e?.statusCode && `status=${e.statusCode}`,
		e?.code && `code=${e.code}`,
		e?.requestId && `req=${e.requestId}`,
	].filter(Boolean);
	return `${e?.message ?? String(error)}${parts.length ? ` [${parts.join(" ")}]` : ""}`;
};

/** GET /v1/account (who owns the key) + GET /v2/core/accounts (can it mint sub-accounts).
 * rawRequest, not v2 list(): list() leaves a dangling auto-pager rejection that would crash the daemon. */
const probeKey = async ({ secret }: { secret: string }) => {
	const stripe = stripeForKey({ secret });
	let platformAccountId: string | null = null;
	let displayName: string | null = null;
	let retrieveError: string | null = null;
	try {
		const account = await withStripeRequestSlot(() =>
			stripe.accounts.retrieve(undefined, STRIPE_REQUEST_OPTIONS),
		);
		platformAccountId = account.id;
		displayName =
			account.settings?.dashboard?.display_name ||
			account.business_profile?.name ||
			account.email ||
			"(unnamed)";
	} catch (error) {
		retrieveError = describeStripeError(error);
	}

	let v2Error: string | null = null;
	try {
		await withStripeRequestSlot(() =>
			stripe.rawRequest(
				"GET",
				"/v2/core/accounts?limit=1",
				{},
				STRIPE_REQUEST_OPTIONS,
			),
		);
	} catch (error) {
		v2Error = describeStripeError(error);
	}

	const unusableReason = retrieveError
		? `account.retrieve failed: ${retrieveError}`
		: v2Error
			? `v2.core.accounts.list failed (Connect / v2 Accounts API not enabled?): ${v2Error}`
			: null;
	return {
		platformAccountId,
		displayName,
		unusableReason,
		probe: { retrieve: retrieveError ?? "ok", v2List: v2Error ?? "ok" },
	};
};

let inFlight: Promise<void> | undefined;

/**
 * Resolve + probe every TW_V3_KEYS key, upsert stripe_keys by platform account,
 * mark vanished keys present=false, refresh the in-memory secret map.
 */
export const syncKeysFromEnv = ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<void> => {
	inFlight ??= runSync({ ctx }).finally(() => {
		inFlight = undefined;
	});
	return inFlight;
};

const runSync = async ({ ctx }: { ctx: TwdContext }): Promise<void> => {
	const secrets = [
		...new Set(
			ctx.env.TW_V3_KEYS.split(",")
				.map((key) => key.trim())
				.filter(Boolean),
		),
	];
	const limit = pLimit(PROBE_CONCURRENCY);
	const probed = await Promise.all(
		secrets.map((secret) =>
			limit(async () => ({ secret, ...(await probeKey({ secret })) })),
		),
	);

	const resolvedIds = new Set<string>();
	const now = new Date();
	for (const result of probed) {
		const keyHash = hashKey({ secret: result.secret });
		const platformAccountId =
			result.platformAccountId ??
			`${UNRESOLVED_KEY_PREFIX}${keyHash.slice(0, 16)}`;
		if (result.platformAccountId) {
			resolvedIds.add(result.platformAccountId);
			rememberKeySecret({ platformAccountId, secret: result.secret });
		}
		const fields = {
			keyHash,
			keyHint: keyHint({ secret: result.secret }),
			displayName: result.displayName,
			usable: result.unusableReason === null,
			unusableReason: result.unusableReason,
			probe: result.probe,
			probedAt: now,
			present: true,
			updatedAt: now,
		};
		await ctx.db.transaction(async (tx) => {
			await tx
				.delete(stripeKeys)
				.where(
					and(
						eq(stripeKeys.keyHash, keyHash),
						like(stripeKeys.platformAccountId, `${UNRESOLVED_KEY_PREFIX}%`),
						sql`${stripeKeys.platformAccountId} <> ${platformAccountId}`,
					),
				);
			await tx
				.insert(stripeKeys)
				.values({ platformAccountId, ...fields })
				.onConflictDoUpdate({
					target: stripeKeys.platformAccountId,
					set: fields,
				});
		});
		if (result.unusableReason) {
			ctx.logger.warn("twd key unusable", {
				platformAccountId,
				keyHint: fields.keyHint,
				reason: result.unusableReason,
			});
		}
	}

	const presentHashes = secrets.map((secret) => hashKey({ secret }));
	await ctx.db
		.update(stripeKeys)
		.set({
			present: false,
			usable: false,
			unusableReason: "key no longer in TW_V3_KEYS",
			updatedAt: now,
		})
		.where(
			presentHashes.length
				? notInArray(stripeKeys.keyHash, presentHashes)
				: sql`true`,
		);
	forgetKeySecretsExcept({ platformAccountIds: resolvedIds });
};
