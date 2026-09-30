import { and, asc, eq } from "drizzle-orm";
import type { StripeAccount } from "../../../api/contract.ts";
import type { AccountState } from "../../../db/schema/accounts.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const toStripeAccount = (
	row: typeof stripeAccounts.$inferSelect,
): StripeAccount => ({
	id: row.id,
	platformAccountId: row.platformAccountId,
	state: row.state,
	heldBy: row.heldBy,
	runId: row.runId,
	stateChangedAt: row.stateChangedAt.toISOString(),
	brokenReason: row.brokenReason,
});

export const listAccounts = async ({
	ctx,
	state,
	platformAccountId,
}: {
	ctx: TwdContext;
	state?: AccountState;
	platformAccountId?: string;
}): Promise<StripeAccount[]> => {
	const rows = await ctx.db
		.select()
		.from(stripeAccounts)
		.where(
			and(
				state ? eq(stripeAccounts.state, state) : undefined,
				platformAccountId
					? eq(stripeAccounts.platformAccountId, platformAccountId)
					: undefined,
			),
		)
		.orderBy(asc(stripeAccounts.platformAccountId), asc(stripeAccounts.id));
	return rows.map(toStripeAccount);
};
