import { nukeAccountContents } from "@tw/image/nuke-accounts.mjs";
import { eq } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { resolveKeySecret } from "../../keys/actions/resolveKeySecret.ts";
import { setTwdPoolState } from "../../keys/actions/setTwdPoolState.ts";
import {
	brokenReasonFrom,
	describeStripeError,
	isAccountGone,
} from "../../keys/stripeErrors.ts";

const NUKE_TRIES = 3;
const RETRY_DELAY_MS = 5_000;

/** payload: { accountId }. Cleans the account, flips it back to clean; drops it if Stripe deleted it. */
export const handleNukeJob: JobHandler = async ({ ctx, job, signal }) => {
	const accountId = String(job.payload.accountId);
	const [account] = await ctx.db
		.select()
		.from(stripeAccounts)
		.where(eq(stripeAccounts.id, accountId));
	if (!account) {
		ctx.logger.info("twd nuke skipped: account no longer in the ledger", {
			accountId,
		});
		return;
	}
	if (account.state === "in_use" || account.state === "reserved") {
		ctx.logger.warn("twd nuke skipped: account is held", {
			accountId,
			state: account.state,
		});
		return;
	}
	await ctx.db
		.update(stripeAccounts)
		.set({ state: "nuking", brokenReason: null, stateChangedAt: new Date() })
		.where(eq(stripeAccounts.id, accountId));

	const key = await resolveKeySecret({
		ctx,
		platformAccountId: account.platformAccountId,
	});
	let lastError: unknown;
	for (let attempt = 1; attempt <= NUKE_TRIES && !signal.aborted; attempt++) {
		try {
			await setTwdPoolState({
				secret: key,
				accountId,
				state: "nuking",
				extra: { autumn_twd_nuking_at: String(Date.now()) },
			});
			const { counts, ms } = await nukeAccountContents({ accountId, key });
			await setTwdPoolState({
				secret: key,
				accountId,
				state: "clean",
				extra: { autumn_twd_nuked_at: String(Date.now()) },
			});
			const now = new Date();
			await ctx.db
				.update(stripeAccounts)
				.set({
					state: "clean",
					brokenReason: null,
					heldBy: null,
					runId: null,
					reservationId: null,
					reservedUntil: null,
					lastNukedAt: now,
					stateChangedAt: now,
				})
				.where(eq(stripeAccounts.id, accountId));
			ctx.logger.info("twd nuke clean", { accountId, ms, counts });
			return;
		} catch (error) {
			if (isAccountGone(error)) {
				await ctx.db
					.delete(stripeAccounts)
					.where(eq(stripeAccounts.id, accountId));
				ctx.logger.warn(
					"twd nuke: account gone from Stripe, removed from ledger",
					{
						accountId,
						platformAccountId: account.platformAccountId,
						error: describeStripeError(error),
					},
				);
				return;
			}
			lastError = error;
			ctx.logger.warn("twd nuke attempt failed", {
				accountId,
				attempt,
				error: describeStripeError(error),
			});
			if (attempt < NUKE_TRIES) {
				await new Promise((resolve) =>
					setTimeout(resolve, RETRY_DELAY_MS * attempt),
				);
			}
		}
	}
	if (signal.aborted) throw new Error(`nuke ${accountId} aborted`);
	const brokenReason = brokenReasonFrom(lastError);
	await ctx.db
		.update(stripeAccounts)
		.set({ state: "broken", brokenReason, stateChangedAt: new Date() })
		.where(eq(stripeAccounts.id, accountId));
	throw new Error(
		`nuke ${accountId} failed ${NUKE_TRIES}x, marked broken: ${brokenReason}`,
	);
};
