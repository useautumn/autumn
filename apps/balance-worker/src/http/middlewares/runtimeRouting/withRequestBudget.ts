import {
	readRequestBudgetHeader,
	WORKER_REQUEST_BUDGET_HEADER,
} from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../../processor/types/partitionProcessor.js";
import type { ProcessOptions } from "../../../runtime/types/partitionRuntime.js";
import type {
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestContext,
} from "../../types/balanceWorkerHttp.js";

type Runtime = BalanceWorkerRequestContext["runtime"];

/** How long the caller will still wait for this request, when it said. */
export function readRequestBudget(
	context: Context<BalanceWorkerHttpEnv>,
): number | undefined {
	return readRequestBudgetHeader({
		value: context.req.header(WORKER_REQUEST_BUDGET_HEADER),
	});
}

/** The same runtime, with the caller's budget carried into every command it runs for this request. */
export function withRequestBudget({
	runtime,
	budgetMs,
}: {
	runtime: Runtime;
	budgetMs: number | undefined;
}): Runtime {
	if (budgetMs === undefined) return runtime;
	const options: ProcessOptions = { budgetMs };
	function process<Decision>(
		run: (processor: PartitionProcessor) => Promise<Decision>,
	): Promise<Decision> {
		return runtime.process(run, options);
	}
	return { process };
}
