import type {
	PartitionRoute,
	WorkerRequest,
} from "@autumn/balance-worker-client/protocol";
import type {
	MeteringPartitionResolver,
	PartitionRuntime,
} from "../../runtime/types/partitionRuntime.js";

export type BalanceWorkerRequestContext = {
	runtime: Pick<PartitionRuntime, "submitTrack" | "check">;
};

export type BalanceWorkerHttpEnv = {
	Variables: {
		ctx: BalanceWorkerRequestContext;
		request: WorkerRequest;
	};
};

export type BalanceWorkerHttpContext = {
	ownership: {
		findRuntime(
			route: PartitionRoute,
		): BalanceWorkerRequestContext["runtime"] | undefined;
	};
	partitionResolver: MeteringPartitionResolver;
	onError(failure: { cause: unknown }): void;
};
