import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { and, eq, inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { clearIngressRoutesForAccounts } from "../../ingress/actions/clearIngressRoutesForAccounts.ts";
import { resolveKeySecret } from "../../keys/actions/resolveKeySecret.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";
import { describeStripeError, isAccountGone } from "../../keys/stripeErrors.ts";
import { stripeForKey } from "../../keys/stripeForKey.ts";
import { lockCleanAccounts } from "../repos/cleanAccountsRepo.ts";
import { enqueueNukeJobs } from "./enqueueNukeJobs.ts";

/**
 * Frozen cross-task API for the account ledger.
 * Claims are atomic (FOR UPDATE SKIP LOCKED), spread across usable keys under the per-key cap.
 */
export type ClaimedAccount = {
	accountId: string;
	platformAccountId: string;
	/** Secret for this account's platform key, resolved from TW_V3_KEYS. */
	secretKey: string;
};

/** Per-claim retrieve fan-out; each request also takes a shared Stripe budget slot. */
const VERIFY_CONCURRENCY = 16;

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

/** false only when Stripe says the account is gone; other errors keep it (the run surfaces them). */
const accountExists = async ({
	ctx,
	account,
}: {
	ctx: TwdContext;
	account: ClaimedAccount;
}): Promise<boolean> => {
	try {
		const retrieved = await withStripeRequestSlot(() =>
			stripeForKey({ secret: account.secretKey }).accounts.retrieve(
				account.accountId,
				undefined,
				STRIPE_REQUEST_OPTIONS,
			),
		);
		return !(retrieved as { deleted?: unknown }).deleted;
	} catch (error) {
		if (isAccountGone(error)) return false;
		ctx.logger.warn("twd claim verify failed; keeping account", {
			accountId: account.accountId,
			error: describeStripeError(error),
		});
		return true;
	}
};

/**
 * clean → in_use, up to `count` (fewer, even 0, when the pool is short). Every claimed account is
 * retrieved from Stripe; vanished ones leave the ledger and are replaced from the clean pool.
 */
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

	const secrets = new Map<string, Promise<string>>();
	const secretFor = (platformAccountId: string) => {
		let secret = secrets.get(platformAccountId);
		if (!secret) {
			secret = resolveKeySecret({ ctx, platformAccountId });
			secrets.set(platformAccountId, secret);
		}
		return secret;
	};
	const verifyLimit = pLimit(VERIFY_CONCURRENCY);
	const verified: ClaimedAccount[] = [];
	const claimedIds: string[] = [];
	try {
		while (verified.length < need) {
			const rows = await claimRound({
				ctx,
				runId,
				heldBy,
				need: need - verified.length,
			});
			if (rows.length === 0) break;
			claimedIds.push(...rows.map((row) => row.accountId));
			const checked = await Promise.all(
				rows.map((row) =>
					verifyLimit(async () => {
						const account = {
							...row,
							secretKey: await secretFor(row.platformAccountId),
						};
						return { account, exists: await accountExists({ ctx, account }) };
					}),
				),
			);
			const gone = checked.filter(({ exists }) => !exists);
			if (gone.length > 0) {
				await ctx.db.delete(stripeAccounts).where(
					inArray(
						stripeAccounts.id,
						gone.map(({ account }) => account.accountId),
					),
				);
				for (const { account } of gone) {
					ctx.logger.warn(
						"twd claim: account gone from Stripe, removed from ledger",
						{
							runId,
							accountId: account.accountId,
							platformAccountId: account.platformAccountId,
						},
					);
				}
			}
			verified.push(
				...checked.filter(({ exists }) => exists).map(({ account }) => account),
			);
		}
	} catch (error) {
		await returnUnusedAccounts({ ctx, runId, accountIds: claimedIds });
		throw error;
	}
	return verified;
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
