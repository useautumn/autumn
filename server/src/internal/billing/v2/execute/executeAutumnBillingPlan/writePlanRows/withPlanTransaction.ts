import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Runs the writes on one Postgres transaction: they land together or not at all. */
export const withPlanTransaction = <Result>({
	ctx,
	run,
}: {
	ctx: AutumnContext;
	run: (transactionCtx: AutumnContext) => Promise<Result>;
}): Promise<Result> =>
	ctx.db.transaction((tx) => run({ ...ctx, db: tx as unknown as DrizzleCli }));
