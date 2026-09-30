import { and, eq, inArray } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { clearIngressRoutesForAccounts } from "../../ingress/actions/clearIngressRoutesForAccounts.ts";
import { resolveKeySecret } from "../../keys/actions/resolveKeySecret.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";
import { lockCleanAccounts } from "../repos/cleanAccountsRepo.ts";
import { enqueueNukeJobs } from "./enqueueNukeJobs.ts";

/**
 * Frozen cross-task API for the account ledger.
 * Claims are atomic (FOR UPDATE SKIP LOCKED), spread across usable keys under the per-key cap.
 */
export type ClaimedAccount = {
	accountId: string;
	platformAccountId: string;
	/** Secret for this account's platform key, stored in twd. */
	secretKey: string;
};

type ClaimedRow = { accountId: string; platformAccountId: string };

/** One atomic claim of up to `need` clean accounts. */
const claimRound = async ({
	ctx,
	runId,
	heldBy,
	need,
}: {
	ctx: TwdContext;
	runId: string;
	heldBy: string;
	need: number;
}): Promise<ClaimedRow[]> =>
	ctx.db.transaction(async (tx) => {
		const ids = await lockCleanAccounts({ tx, need });
		if (ids.length === 0) return [];
		return tx
			.update(stripeAccounts)
			.set({ state: "in_use", runId, heldBy, stateChangedAt: new Date() })
			.where(inArray(stripeAccounts.id, ids))
			.returning({
				accountId: stripeAccounts.id,
				platformAccountId: stripeAccounts.platformAccountId,
			});
	});

/** clean → in_use, up to `count` (fewer, even 0, when the pool is short). The ledger is trusted: reinit and nukes keep it true. */
export const claimAccountsForRun = async ({
	ctx,
	runId,
	heldBy,
	count: need,
}: {
	ctx: TwdContext;
	runId: string;
	heldBy: string;
	count: number;
}): Promise<ClaimedAccount[]> => {
	const gate = await getKeyGate({ db: ctx.db });
	if (gate.state === "draining") {
		throw new TwdError({
			status: 503,
			code: "keys_draining",
			message: `Stripe keys are being re-initialised${gate.reason ? `: ${gate.reason}` : ""}.`,
			next: "Wait for the reinit_keys job to finish (GET /keys shows the gate), then retry.",
			escalate: gate.reason?.startsWith("reinit failed")
				? "Key re-init failed — ask a twd admin to fix it and rerun POST /keys/reinit."
				: undefined,
			details: { jobId: gate.jobId },
		});
	}

	const rows = await claimRound({ ctx, runId, heldBy, need });
	try {
		const secrets = new Map<string, Promise<string>>();
		const secretFor = (platformAccountId: string) => {
			let secret = secrets.get(platformAccountId);
			if (!secret) {
				secret = resolveKeySecret({ ctx, platformAccountId });
				secrets.set(platformAccountId, secret);
			}
			return secret;
		};
		return await Promise.all(
			rows.map(async (row) => ({
				...row,
				secretKey: await secretFor(row.platformAccountId),
			})),
		);
	} catch (error) {
		await returnUnusedAccounts({
			ctx,
			runId,
			accountIds: rows.map((row) => row.accountId),
		});
		throw error;
	}
};

/** in_use → clean for accounts no sandbox ever touched (failed claim, run already gone, surplus). */
export const returnUnusedAccounts = async ({
	ctx,
	runId,
	accountIds,
}: {
	ctx: TwdContext;
	runId: string;
	accountIds: string[];
}): Promise<void> => {
	if (accountIds.length === 0) return;
	await ctx.db
		.update(stripeAccounts)
		.set({
			state: "clean",
			runId: null,
			heldBy: null,
			stateChangedAt: new Date(),
		})
		.where(
			and(
				eq(stripeAccounts.runId, runId),
				eq(stripeAccounts.state, "in_use"),
				inArray(stripeAccounts.id, accountIds),
			),
		);
};

/** in_use → nuking (all of the run's, or just `accountIds`); enqueues one nuke:<acct> job each. Idempotent. */
export const releaseRunAccounts = async ({
	ctx,
	runId,
	accountIds: only,
}: {
	ctx: TwdContext;
	runId: string;
	accountIds?: string[];
}): Promise<void> => {
	if (only?.length === 0) return;
	const ofRun = (state: "in_use" | "nuking") =>
		and(
			eq(stripeAccounts.runId, runId),
			eq(stripeAccounts.state, state),
			only ? inArray(stripeAccounts.id, only) : undefined,
		);
	await ctx.db
		.update(stripeAccounts)
		.set({ state: "nuking", stateChangedAt: new Date() })
		.where(ofRun("in_use"));
	const nuking = await ctx.db
		.select({ id: stripeAccounts.id })
		.from(stripeAccounts)
		.where(ofRun("nuking"));
	const accountIds = nuking.map((row) => row.id);
	clearIngressRoutesForAccounts({ accountIds });
	await enqueueNukeJobs({ ctx, accountIds });
};
