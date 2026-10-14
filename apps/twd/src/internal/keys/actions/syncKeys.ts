import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { and, eq, isNotNull, like, or, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { openSecret, sealSecret } from "../../../lib/secretBox.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	forgetKeySecret,
	forgetKeySecretsExcept,
	hashKey,
	keyHint,
	rememberKeySecret,
} from "../keySecrets.ts";
import {
	fullNukeLocked,
	unusableReasonFromProbe,
} from "../repos/fullNukeLockRepo.ts";
import { describeStripeError } from "../stripeErrors.ts";
import { stripeForKey } from "../stripeForKey.ts";

const PROBE_CONCURRENCY = 8;
export const UNRESOLVED_KEY_PREFIX = "unresolved:";

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

	const probe = { retrieve: retrieveError ?? "ok", v2List: v2Error ?? "ok" };
	return {
		platformAccountId,
		displayName,
		unusableReason: unusableReasonFromProbe({ probe }),
		probe,
	};
};

let inFlight: Promise<void> | undefined;

export const loadKnownSecrets = async ({ ctx }: { ctx: TwdContext }) => {
	const rows = await ctx.db
		.select({ sealed: stripeKeys.secretCiphertext })
		.from(stripeKeys)
		.where(isNotNull(stripeKeys.secretCiphertext));
	const stored = rows.flatMap(({ sealed }) =>
		sealed ? [openSecret({ sealed })] : [],
	);
	return parseKeyList({
		text: [ctx.env.TW_V3_KEYS, ...stored].join(","),
	}).filter((secret) => !isShardKey({ ctx, secret }));
};

export const SHARD_KEY_REASON =
	"reserved for the stripe-connect shard (SHARD_STRIPE_SANDBOX_KEY); never pooled";

export const isShardKey = ({
	ctx,
	secret,
}: {
	ctx: TwdContext;
	secret: string;
}) => secret === ctx.env.SHARD_STRIPE_SANDBOX_KEY.trim();

const shardPlatformAccountId = async (secret: string) =>
	(
		await withStripeRequestSlot(() =>
			stripeForKey({ secret }).accounts.retrieve(
				undefined,
				STRIPE_REQUEST_OPTIONS,
			),
		)
	).id;

export const retireShardKey = async ({
	ctx,
	resolvePlatformAccountId = shardPlatformAccountId,
}: {
	ctx: TwdContext;
	resolvePlatformAccountId?: (secret: string) => Promise<string>;
}) => {
	const secret = ctx.env.SHARD_STRIPE_SANDBOX_KEY.trim();
	if (!secret) return;
	const platformAccountId = await resolvePlatformAccountId(secret).catch(
		(error: unknown) => {
			throw new Error(
				`stripe-connect shard platform lookup failed, so its stored keys can't be retired: ${String(error)}`,
			);
		},
	);
	const retired = await ctx.db
		.update(stripeKeys)
		.set({
			usable: false,
			present: false,
			secretCiphertext: null,
			unusableReason: SHARD_KEY_REASON,
			updatedAt: new Date(),
		})
		.where(
			or(
				eq(stripeKeys.keyHash, hashKey({ secret })),
				eq(stripeKeys.platformAccountId, platformAccountId),
			),
		)
		.returning({ platformAccountId: stripeKeys.platformAccountId });
	for (const row of retired)
		forgetKeySecret({ platformAccountId: row.platformAccountId });
};

export const parseKeyList = ({ text }: { text: string }) => [
	...new Set(
		text
			.split(/[\s,;]+/)
			.filter((token) => /^(sk|rk)_(test|live)_\w+$/.test(token)),
	),
];

export const syncKeys = ({ ctx }: { ctx: TwdContext }): Promise<void> => {
	inFlight ??= loadKnownSecrets({ ctx })
		.then(async (secrets) => {
			const { resolvedIds } = await probeAndStoreKeys({ ctx, secrets });
			await retireShardKey({ ctx });
			forgetKeySecretsExcept({ platformAccountIds: resolvedIds });
		})
		.finally(() => {
			inFlight = undefined;
		});
	return inFlight;
};

const sealIfConfigured = ({
	ctx,
	secret,
}: {
	ctx: TwdContext;
	secret: string;
}) =>
	ctx.env.TWD_KEY_ENCRYPTION_SECRET ? sealSecret({ plaintext: secret }) : null;

export const probeAndStoreKeys = async ({
	ctx,
	secrets,
	storeUnresolved = true,
}: {
	ctx: TwdContext;
	secrets: string[];
	storeUnresolved?: boolean;
}) => {
	const limit = pLimit(PROBE_CONCURRENCY);
	const probed = await Promise.all(
		secrets.map((secret) =>
			limit(async () => ({ secret, ...(await probeKey({ secret })) })),
		),
	);

	const resolvedIds = new Set<string>();
	const now = new Date();
	for (const result of probed) {
		if (!storeUnresolved && !result.platformAccountId) continue;
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
			secretCiphertext: sealIfConfigured({ ctx, secret: result.secret }),
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
					set: {
						...fields,
						usable: sql`case when ${fullNukeLocked} then false else ${fields.usable} end`,
						unusableReason: sql`case when ${fullNukeLocked} then ${stripeKeys.unusableReason} else ${fields.unusableReason} end`,
					},
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
	return { probed, resolvedIds };
};
