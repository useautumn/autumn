import { eq } from "drizzle-orm";
import type { EnqueueResponse } from "../../../api/contract.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { toEnqueueResponses } from "../../accounts/actions/toEnqueueResponses.ts";
import { countHeldAccountsOnKey } from "../../accounts/repos/accountCountsRepo.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import { lockKeyForFullNuke } from "../repos/fullNukeLockRepo.ts";
import { getKeyGate } from "../repos/keyGateRepo.ts";

export const DEFAULT_FULL_NUKE_TARGET_PER_KEY = 2;

/** Locks the key immediately so no run claims its accounts while the job waits for a lease. */
export const enqueueFullNukeKey = async ({
	ctx,
	platformAccountId,
	targetPerKey = DEFAULT_FULL_NUKE_TARGET_PER_KEY,
}: {
	ctx: TwdContext;
	platformAccountId: string;
	targetPerKey?: number;
}): Promise<EnqueueResponse> => {
	const [key] = await ctx.db
		.select({ present: stripeKeys.present })
		.from(stripeKeys)
		.where(eq(stripeKeys.platformAccountId, platformAccountId));
	if (!key) {
		throw new TwdError({
			status: 404,
			code: "unknown_key",
			message: `No Stripe key for platform account ${platformAccountId}.`,
			next: "GET /keys for valid platformAccountIds.",
		});
	}
	if (!key.present) {
		throw new TwdError({
			status: 409,
			code: "key_missing",
			message: `The key for ${platformAccountId} is no longer in TW_V3_KEYS.`,
			next: "Nothing to nuke with; POST /keys/probe after the key is restored.",
			escalate: `Ask a twd admin to add the key for ${platformAccountId} back to TW_V3_KEYS.`,
		});
	}
	const gate = await getKeyGate({ db: ctx.db });
	if (gate.state === "draining") {
		throw new TwdError({
			status: 409,
			code: "keys_draining",
			message: "A key re-init is in progress.",
			next: "Wait for the reinit_keys job to finish (GET /keys shows the gate), then retry.",
			details: { jobId: gate.jobId },
		});
	}
	const held = await countHeldAccountsOnKey({ db: ctx.db, platformAccountId });
	if (held > 0) {
		throw new TwdError({
			status: 409,
			code: "key_busy",
			message: `${held} accounts on ${platformAccountId} are in_use or reserved.`,
			next: `Wait for runs to finish and reservations to be released (GET /accounts?key=${platformAccountId}), then retry.`,
			details: { platformAccountId, held },
		});
	}

	const result = await enqueueJob({
		ctx,
		kind: "full_nuke_key",
		singletonKey: `full_nuke_key:${platformAccountId}`,
		payload: { platformAccountId, targetPerKey },
	});
	if (!result.deduped) {
		await lockKeyForFullNuke({ db: ctx.db, platformAccountId });
	}
	const [response] = await toEnqueueResponses({ ctx, results: [result] });
	return response;
};
