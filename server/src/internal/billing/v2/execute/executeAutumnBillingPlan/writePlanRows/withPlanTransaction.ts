import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { withDeferredMarks } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

export const withPlanTransaction = <Result>({
	ctx,
	run,
}: {
	ctx: AutumnContext;
	run: (transactionCtx: AutumnContext) => Promise<Result>;
}): Promise<Result> =>
	withDeferredMarks({
		db: ctx.db,
		run: () =>
			ctx.db.transaction((tx) =>
				run({ ...ctx, db: tx as unknown as DrizzleCli }),
			),
	});
