import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import {
	balanceWorkerFailOpenReasonOf,
	describeBalanceWorkerFailure,
	type BalanceWorkerFailOpenReason as WorkerFailOpenReason,
} from "../balanceWorkerErrors.js";

export type BalanceWorkerFailOpenResult<Result> = {
	result: Result;
	failedOpen: boolean;
};

export type BalanceWorkerFailOpenReason =
	| "org_rate_limit"
	| WorkerFailOpenReason;

export const withBalanceWorkerFailOpen = async <Result>({
	ctx,
	source,
	commandId,
	run,
	fallback,
}: {
	ctx: AutumnContext;
	source: string;
	commandId?: string;
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
		const reason = balanceWorkerFailOpenReasonOf(error);
		if (!reason) throw error;
		ctx.logger.warn(`[balanceWorker] ${reason}; failing open`, {
			type: "balance_worker_fail_open",
			fail_open_reason: reason,
			fail_open_source: source,
			...(commandId ? { command_id: commandId } : {}),
			worker_failure: describeBalanceWorkerFailure({ error }),
			data: { source, reason },
			error,
		});
		addToExtraLogs({ ctx, extras: { balanceWorkerFailOpen: source } });
		return { result: await fallback({ error, reason }), failedOpen: true };
	}
};
