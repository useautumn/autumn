import type { MeteringIdentity, TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import type {
	ApplyBillingPlanReply,
	CheckReply,
	ConfirmExpiredLockReply,
	FinalizeReply,
	InitializeReply,
	PartitionRoute,
	ReadSubjectStateReply,
	ResetReply,
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
	response?:
		| TrackReply
		| CheckReply
		| ApplyBillingPlanReply
		| ReadSubjectStateReply
		| InitializeReply
		| FinalizeReply
		| ConfirmExpiredLockReply
		| ResetReply;
	error?: Error;
	errorCode?: WorkerErrorCode;
	/** A track batch logs once: its size and failures counted by code, never one line per command. */
	batch?: BalanceWorkerBatchLog;
};

export type BalanceWorkerBatchLog = {
	route: PartitionRoute;
	count: number;
	succeeded: number;
	failed: number;
	errorCodes: Partial<Record<WorkerErrorCode, number>>;
	/** The worst status any command was answered with, so the line logs at that level. */
	worstStatus: number;
	/** Org of the first command; customer and entity only when every command shares them. */
	identity?: Partial<MeteringIdentity>;
	orgSlug?: string;
};

export type BalanceWorkerHttpContext = {
	ownership: {
		findRuntime(
			route: PartitionRoute,
		): BalanceWorkerRequestContext["runtime"] | undefined;
		awaitHandoff?(target: { partition: number }): Promise<void>;
	};
	partitionResolver: MeteringPartitionResolver;
	logger: Pick<AutumnLogger, "debug" | "info" | "warn" | "error">;
};
