import {
	markNuking,
	nukeAccountContents,
	setPoolState,
} from "@tw/image/nuke-accounts.mjs";
import { eq } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { resolveKeySecret } from "../../keys/actions/resolveKeySecret.ts";

const NUKE_TRIES = 3;
const RETRY_DELAY_MS = 5_000;

/** payload: { accountId }. Cleans the account, flips it back to clean. OWNED BY THE KEYS TASK. */
export const handleNukeJob: JobHandler = async ({ ctx, job, signal }) => {
	const accountId = String(job.payload.accountId);
	const [account] = await ctx.db
		.select()
		.from(stripeAccounts)
		.where(eq(stripeAccounts.id, accountId));
	if (!account) throw new Error(`nuke: unknown account ${accountId}`);
	if (account.state === "in_use" || account.state === "reserved") {
		ctx.logger.warn("twd nuke skipped: account is held", {
			accountId,
			state: account.state,
		});
		return;
	}
	await ctx.db
		.update(stripeAccounts)
		.set({ state: "nuking", stateChangedAt: new Date() })
		.where(eq(stripeAccounts.id, accountId));

	const key = await resolveKeySecret({
		ctx,
		platformAccountId: account.platformAccountId,
	});
	let lastError: unknown;
	for (let attempt = 1; attempt <= NUKE_TRIES && !signal.aborted; attempt++) {
		try {
			// Pool metadata kept in sync so legacy `bun tw` claims never grab a twd account mid-nuke.
			await markNuking({ accountId, key });
			const { counts, ms } = await nukeAccountContents({ accountId, key });
			await setPoolState({
				accountId,
				key,
				state: "clean",
				extra: { autumn_tw_nuked_at: String(Date.now()) },
			});
			const now = new Date();
			await ctx.db
				.update(stripeAccounts)
				.set({
					state: "clean",
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
			lastError = error;
			ctx.logger.warn("twd nuke attempt failed", {
				accountId,
				attempt,
				error: (error as Error).message,
			});
			if (attempt < NUKE_TRIES) {
				await new Promise((resolve) =>
					setTimeout(resolve, RETRY_DELAY_MS * attempt),
				);
			}
		}
	}
	if (signal.aborted) throw new Error(`nuke ${accountId} aborted`);
	await ctx.db
		.update(stripeAccounts)
		.set({ state: "broken", stateChangedAt: new Date() })
		.where(eq(stripeAccounts.id, accountId));
	throw new Error(
		`nuke ${accountId} failed ${NUKE_TRIES}x, marked broken: ${(lastError as Error)?.message}`,
	);
};
