import {
	readRequestBudgetHeader,
	readRequestDeadlineHeader,
	WORKER_REQUEST_BUDGET_HEADER,
	WORKER_REQUEST_DEADLINE_HEADER,
} from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../../processor/types/partitionProcessor.js";
import type { ProcessOptions } from "../../../runtime/types/partitionRuntime.js";
import type {
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestContext,
} from "../../types/balanceWorkerHttp.js";

type Runtime = BalanceWorkerRequestContext["runtime"];

/** How long the caller will still wait for this request, and the moment it stops, when it said. */
export function readRequestBudget(
	context: Context<BalanceWorkerHttpEnv>,
): ProcessOptions {
	return {
		budgetMs: readRequestBudgetHeader({
			value: context.req.header(WORKER_REQUEST_BUDGET_HEADER),
		}),
		deadlineAt: readRequestDeadlineHeader({
			value: context.req.header(WORKER_REQUEST_DEADLINE_HEADER),
		}),
	};
}

/** The same runtime, with the caller's budget carried into every command it runs for this request. */
export function withRequestBudget({
	runtime,
	budget,
}: {
	runtime: Runtime;
	budget: ProcessOptions;
}): Runtime {
	if (budget.budgetMs === undefined && budget.deadlineAt === undefined)
		return runtime;
	function process<Decision>(
		run: (processor: PartitionProcessor) => Promise<Decision>,
	): Promise<Decision> {
		return runtime.process(run, budget);
	}
	return { process };
}
