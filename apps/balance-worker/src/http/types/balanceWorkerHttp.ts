import type { TrackCommand, TrackDecision } from "@autumn/balance-engine";
import type {
	PartitionRoute,
	WorkerErrorCode,
	WorkerRequest,
} from "@autumn/balance-worker-client/protocol";
import type { AutumnLogger } from "@autumn/logging";
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
		requestLog: BalanceWorkerRequestLog;
	};
};

export type BalanceWorkerRequestLog = {
	id: string;
	command?: TrackCommand;
	decision?: TrackDecision;
	error?: Error;
	errorCode?: WorkerErrorCode;
};

export type BalanceWorkerHttpContext = {
	ownership: {
		findRuntime(
			route: PartitionRoute,
		): BalanceWorkerRequestContext["runtime"] | undefined;
	};
	partitionResolver: MeteringPartitionResolver;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
};
