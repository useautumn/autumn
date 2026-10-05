import type { PartitionRoute } from "@autumn/balance-worker-client/protocol";
import type { PartitionRuntimePort } from "../../../../partitions/types/partitions.js";
import type { BalanceWorkerHttpContext } from "../../../types/balanceWorkerHttp.js";
import type { InlineCounters } from "../inlineCounters.js";

export type InlineHandlerContext = Pick<
	BalanceWorkerHttpContext,
	"partitionResolver" | "logger" | "requestLog"
> & {
	ownership: {
		findRuntime(
			route: PartitionRoute,
		): Pick<PartitionRuntimePort, "processInline"> | undefined;
	};
	counters: InlineCounters;
};
