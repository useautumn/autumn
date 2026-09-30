import { and, eq, ne } from "drizzle-orm";
import type { StripeAccount } from "../../../api/contract.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { toStripeAccount } from "./listAccounts.ts";

/** Drops a ledger row (e.g. the account was deleted in Stripe). Never touches Stripe. */
export const forgetAccount = async ({
	ctx,
	accountId,
}: {
	ctx: TwdContext;
	accountId: string;
}): Promise<StripeAccount> => {
	const [forgotten] = await ctx.db
		.delete(stripeAccounts)
		.where(
			and(eq(stripeAccounts.id, accountId), ne(stripeAccounts.state, "in_use")),
		)
		.returning();
	if (forgotten) {
		ctx.logger.info("twd account forgotten", {
			accountId,
			platformAccountId: forgotten.platformAccountId,
			state: forgotten.state,
			by: ctx.actor?.email,
		});
		return toStripeAccount(forgotten);
	}
	const [held] = await ctx.db
		.select()
		.from(stripeAccounts)
		.where(eq(stripeAccounts.id, accountId));
	if (!held) {
		throw new TwdError({
			status: 404,
			code: "unknown_account",
			message: `${accountId} is not in the twd ledger.`,
			next: "GET /accounts for valid ids; nothing to forget.",
		});
	}
	throw new TwdError({
		status: 409,
		code: "account_held",
		message: `${accountId} is ${held.state}${held.runId ? ` by run ${held.runId}` : ""}.`,
		next: "Wait for the run to finish (or cancel it); its teardown releases the account.",
		details: { state: held.state, runId: held.runId },
	});
};
