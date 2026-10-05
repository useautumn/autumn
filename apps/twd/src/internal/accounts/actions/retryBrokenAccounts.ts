import { and, eq, inArray } from "drizzle-orm";
import type { RetryBrokenAccountsResponse } from "../../../api/contract.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { isFullNukeLockReason } from "../../keys/repos/fullNukeLockRepo.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";
import { nukeAccounts } from "./nukeAccounts.ts";
import { selectBrokenToRetry } from "./selectBrokenToRetry.ts";

const NUKE_KEY_PREFIX = "nuke:";

/** Bulk "Retry nuke": the row action applied to every broken account. */
export const retryBrokenAccounts = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<RetryBrokenAccountsResponse> => {
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

	const [ledger, liveNukes] = await Promise.all([
		ctx.db
			.select({
				id: stripeAccounts.id,
				state: stripeAccounts.state,
				keyPresent: stripeKeys.present,
				keyUnusableReason: stripeKeys.unusableReason,
			})
			.from(stripeAccounts)
			.innerJoin(
				stripeKeys,
				eq(stripeKeys.platformAccountId, stripeAccounts.platformAccountId),
			),
		ctx.db
			.select({ singletonKey: jobs.singletonKey })
			.from(jobs)
			.where(
				and(eq(jobs.kind, "nuke"), inArray(jobs.status, ["queued", "running"])),
			),
	]);

	const { retry, skipped } = selectBrokenToRetry({
		accounts: ledger.map((row) => ({
			id: row.id,
			state: row.state,
			keyAvailable:
				row.keyPresent && !isFullNukeLockReason(row.keyUnusableReason),
		})),
		liveNukeAccountIds: new Set(
			liveNukes.map((job) => job.singletonKey.slice(NUKE_KEY_PREFIX.length)),
		),
	});
	if (retry.length === 0) return { enqueued: 0, skipped: skipped.length };

	const results = await nukeAccounts({ ctx, accountIds: retry });
	const enqueued = results.filter((result) => !result.deduped).length;
	return { enqueued, skipped: skipped.length + results.length - enqueued };
};
