import type { MeteringIdentity, TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import type {
	ApplyBillingPlanReply,
	CheckReply,
	ConfirmExpiredLockReply,
	DeleteBalanceReply,
	FinalizeReply,
	InitializeReply,
	PartitionRoute,
	ReadSubjectStateReply,
	RecalculateBalanceReply,
	ResetReply,
	UpdateBalanceReply,
	WorkerErrorCode,
	WorkerRequest,
	WorkerRouteSuccessor,
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
	response?:
		| TrackReply
		| CheckReply
		| ApplyBillingPlanReply
		| ReadSubjectStateReply
		| InitializeReply
		| FinalizeReply
		| ConfirmExpiredLockReply
		| ResetReply
		| UpdateBalanceReply
		| DeleteBalanceReply
		| RecalculateBalanceReply;
	error?: Error;
	errorCode?: WorkerErrorCode;
	batch?: BalanceWorkerBatchLog;
};

export type BalanceWorkerBatchLog = {
	route: PartitionRoute;
	count: number;
	succeeded: number;
	failed: number;
	errorCodes: Partial<Record<WorkerErrorCode, number>>;
	worstStatus: number;
	identity?: Partial<MeteringIdentity>;
	orgSlug?: string;
};

export type BalanceWorkerHttpContext = {
	ownership: {
		findRuntime(
			route: PartitionRoute,
		): BalanceWorkerRequestContext["runtime"] | undefined;
		awaitHandoff?(target: { partition: number }): Promise<void>;
		findSuccessor?(target: {
			partition: number;
		}): WorkerRouteSuccessor | undefined;
	};
	partitionResolver: MeteringPartitionResolver;
	logger: Pick<AutumnLogger, "debug" | "info" | "warn" | "error">;
	requestLog?: { successSampleRate: number };
};
