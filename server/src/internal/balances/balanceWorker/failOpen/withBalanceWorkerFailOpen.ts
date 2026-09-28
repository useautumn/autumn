import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { isBalanceWorkerUnavailableError } from "../balanceWorkerErrors.js";

/** The answer, and whether the fallback gave it in place of the worker. */
export type BalanceWorkerFailOpenResult<Result> = {
	result: Result;
	failedOpen: boolean;
};

/** Why the fallback answered instead of the worker. */
export type BalanceWorkerFailOpenReason =
	| "org_rate_limit"
	| "balance_worker_unavailable";

/** Runs a worker request; `fallback` answers instead when the org is over its rate cap, or when the worker was
 *  unreachable and nothing was submitted. */
export const withBalanceWorkerFailOpen = async <Result>({
	ctx,
	source,
	run,
	fallback,
}: {
	ctx: AutumnContext;
	source: string;
	run: () => Promise<Result>;
	fallback: (params: {
		error: unknown;
		reason: BalanceWorkerFailOpenReason;
	}) => Promise<Result>;
}): Promise<BalanceWorkerFailOpenResult<Result>> => {
	if (ctx.orgRateLimitDegraded)
		return {
			result: await fallback({
				error: new Error("org aggregate rate cap exceeded"),
				reason: "org_rate_limit",
			}),
			failedOpen: true,
		};
	try {
		return { result: await run(), failedOpen: false };
	} catch (error) {
		if (!isBalanceWorkerUnavailableError(error)) throw error;
		ctx.logger.warn("[balanceWorker] unavailable; failing open", {
			type: "balance_worker_fail_open",
			data: { source },
			error,
		});
		addToExtraLogs({ ctx, extras: { balanceWorkerFailOpen: source } });
		return {
			result: await fallback({ error, reason: "balance_worker_unavailable" }),
			failedOpen: true,
		};
	}
};
