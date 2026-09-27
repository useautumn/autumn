import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { isBalanceWorkerUnavailableError } from "../balanceWorkerErrors.js";

/** The answer, and whether the fallback gave it in place of the worker. */
export type BalanceWorkerFailOpenResult<Result> = {
	result: Result;
	failedOpen: boolean;
};

/** Runs a worker request; when the worker was unreachable and nothing was submitted, `fallback` answers instead. */
export const withBalanceWorkerFailOpen = async <Result>({
	ctx,
	source,
	run,
	fallback,
}: {
	ctx: AutumnContext;
	source: string;
	run: () => Promise<Result>;
	fallback: ({ error }: { error: unknown }) => Promise<Result>;
}): Promise<BalanceWorkerFailOpenResult<Result>> => {
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
		return { result: await fallback({ error }), failedOpen: true };
	}
};
