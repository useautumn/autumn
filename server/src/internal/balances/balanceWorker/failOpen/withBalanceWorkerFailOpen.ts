import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import {
	type BalanceWorkerFailOpenReason,
	balanceWorkerFailOpenReasonOf,
} from "../balanceWorkerErrors.js";

/** The answer, and whether the fallback gave it in place of the worker. */
export type BalanceWorkerFailOpenResult<Result> = {
	result: Result;
	failedOpen: boolean;
};

/**
 * Runs a worker request; when the worker was unreachable, shed the command as
 * overloaded, or never confirmed it, `fallback` answers instead. A fallback must
 * therefore be safe when the command did apply: queue the same command ids, or
 * answer without writing. A verdict from the worker always propagates.
 */
export const withBalanceWorkerFailOpen = async <Result>({
	ctx,
	source,
	run,
	fallback,
}: {
	ctx: AutumnContext;
	source: string;
	run: () => Promise<Result>;
	fallback: ({
		error,
		reason,
	}: {
		error: unknown;
		reason: BalanceWorkerFailOpenReason;
	}) => Promise<Result>;
}): Promise<BalanceWorkerFailOpenResult<Result>> => {
	try {
		return { result: await run(), failedOpen: false };
	} catch (error) {
		const reason = balanceWorkerFailOpenReasonOf(error);
		if (!reason) throw error;
		ctx.logger.warn(`[balanceWorker] ${reason}; failing open`, {
			type: "balance_worker_fail_open",
			data: { source, reason },
			error,
		});
		addToExtraLogs({ ctx, extras: { balanceWorkerFailOpen: source } });
		return { result: await fallback({ error, reason }), failedOpen: true };
	}
};
