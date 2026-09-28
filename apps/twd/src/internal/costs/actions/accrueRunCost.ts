import type { TwdContext } from "../../../lib/types/twdContext.ts";

/**
 * Recompute runs.cost_usd / worker_seconds from run_workers (open rows priced up to now).
 * Idempotent; call periodically while live and once after teardown. OWNED BY THE COSTS TASK.
 */
export const accrueRunCost = async (_args: {
	ctx: TwdContext;
	runId: string;
}): Promise<void> => {
	throw new Error("accrueRunCost: not implemented");
};
