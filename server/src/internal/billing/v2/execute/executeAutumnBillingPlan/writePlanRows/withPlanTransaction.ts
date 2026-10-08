import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { withDeferredMarks } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

/** Runs the writes on one Postgres transaction: they land together or not at all. */
export const withPlanTransaction = <Result>({
	ctx,
	run,
}: {
	ctx: AutumnContext;
	run: (transactionCtx: AutumnContext) => Promise<Result>;
}): Promise<Result> =>
	// Marks wait for commit: a mark inside would hold a second client from the transaction's pool.
	withDeferredMarks({
		db: ctx.db,
		run: () =>
			ctx.db.transaction((tx) =>
				run({ ...ctx, db: tx as unknown as DrizzleCli }),
			),
	});
