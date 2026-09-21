import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import type {
	CheckReply,
	InitializeReply,
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
	runtime: Pick<PartitionRuntime, "process">;
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
	command?: Pick<TrackCommand, "requestId" | "identity"> &
		Partial<
			Pick<
				TrackCommand,
				"commandId" | "featureId" | "value" | "properties" | "org"
			>
		>;
	response?: TrackReply | CheckReply | InitializeReply;
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
	logger: Pick<AutumnLogger, "debug" | "info" | "warn" | "error">;
};
