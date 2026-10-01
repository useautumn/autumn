import { inArray } from "drizzle-orm";
import type { ImportKeysResponse } from "../../../api/contract.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import { sealSecret } from "../../../lib/secretBox.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { hashKey } from "../keySecrets.ts";
import {
	isShardKey,
	parseKeyList,
	probeAndStoreKeys,
	SHARD_KEY_REASON,
} from "./syncKeys.ts";

/** Additive: new keys are probed + stored encrypted; keys twd already has are skipped. */
export const importKeys = async ({
	ctx,
	text,
}: {
	ctx: TwdContext;
	text: string;
}): Promise<ImportKeysResponse> => {
	const parsed = parseKeyList({ text });
	if (parsed.length === 0)
		throw new TwdError({
			status: 400,
			code: "no_keys_found",
			message:
				"No Stripe secret keys (sk_test_… / rk_test_…) found in the pasted text.",
			next: "Paste keys separated by commas, spaces, or new lines.",
		});
	const shardKeys = parsed.filter((secret) => isShardKey({ ctx, secret }));
	const poolKeys = parsed.filter((secret) => !isShardKey({ ctx, secret }));
	if (poolKeys.length > 0) sealSecret({ plaintext: "probe" });
	const hashes = poolKeys.map((secret) => hashKey({ secret }));
	const stored = await ctx.db
		.select({
			keyHash: stripeKeys.keyHash,
			sealed: stripeKeys.secretCiphertext,
		})
		.from(stripeKeys)
		.where(inArray(stripeKeys.keyHash, hashes));
	const alreadyStored = new Set(
		stored.filter((row) => row.sealed !== null).map((row) => row.keyHash),
	);
	const fresh = poolKeys.filter(
		(secret) => !alreadyStored.has(hashKey({ secret })),
	);
	const { probed } = await probeAndStoreKeys({
		ctx,
		secrets: fresh,
		storeUnresolved: false,
	});
	const unusable = probed.filter((result) => result.unusableReason !== null);
	return {
		parsed: parsed.length,
		added: probed.filter((result) => result.platformAccountId).length,
		alreadyPresent: poolKeys.length - fresh.length,
		usable: probed.length - unusable.length,
		unusable: [
			...shardKeys.map((secret) => ({
				keyHint: `${secret.slice(0, 8)}…${secret.slice(-4)}`,
				reason: SHARD_KEY_REASON,
			})),
			...unusable.map((result) => ({
				keyHint: `${result.secret.slice(0, 8)}…${result.secret.slice(-4)}`,
				reason: result.unusableReason ?? "unknown",
			})),
		],
	};
};
