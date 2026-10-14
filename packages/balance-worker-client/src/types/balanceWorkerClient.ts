import type {
	ApplyBillingPlanRequest,
	CheckCommand,
	ConfirmExpiredLockCommand,
	DeleteBalanceCommand,
	EvictCommand,
	FinalizeCommand,
	FlushCommand,
	InitializeRequest,
	ReadSubjectStateCommand,
	RecalculateBalanceCommand,
	ResetCommand,
	TrackCommand,
	UpdateBalanceCommand,
} from "@autumn/balance-engine";
import type { CatalogInvalidations } from "../catalog/types/catalogInvalidations.js";
import type { ApplyBillingPlanReply } from "../contracts/applyBillingPlan.js";
import type { CheckReply } from "../contracts/check.js";
import type { ConfirmExpiredLockReply } from "../contracts/confirmExpiredLock.js";
import type { DeleteBalanceReply } from "../contracts/deleteBalance.js";
import type { EvictReply } from "../contracts/evict.js";
import type { FinalizeReply } from "../contracts/finalize.js";
import type { FlushReply } from "../contracts/flush.js";
import type { InitializeReply } from "../contracts/initialize.js";
import type { ReadSubjectStateReply } from "../contracts/readSubjectState.js";
import type { RecalculateBalanceReply } from "../contracts/recalculateBalance.js";
import type { ResetReply } from "../contracts/reset.js";
import type { TrackReply } from "../contracts/track.js";
import type { UpdateBalanceReply } from "../contracts/updateBalance.js";
import type { HttpClient } from "../http/types/httpClient.js";
import type {
	CommandLog,
	CommandQueue,
	EnqueueParams,
} from "../queue/types/queue.js";
import type { PartitionOwners } from "../routing/types/routing.js";

export type TrackParams = { command: TrackCommand; signal?: AbortSignal };
export type CheckParams = { command: CheckCommand; signal?: AbortSignal };
export type ReadSubjectStateParams = {
	command: ReadSubjectStateCommand;
	signal?: AbortSignal;
};
export type EvictParams = { command: EvictCommand; signal?: AbortSignal };
export type FlushParams = { command: FlushCommand; signal?: AbortSignal };
export type ConfirmExpiredLockParams = {
	command: ConfirmExpiredLockCommand;
	signal?: AbortSignal;
};
export type FinalizeParams = { command: FinalizeCommand; signal?: AbortSignal };
export type ResetParams = { command: ResetCommand; signal?: AbortSignal };
export type DeleteBalanceParams = {
	command: DeleteBalanceCommand;
	signal?: AbortSignal;
};
export type RecalculateBalanceParams = {
	command: RecalculateBalanceCommand;
	signal?: AbortSignal;
};
export type UpdateBalanceParams = {
	command: UpdateBalanceCommand;
	signal?: AbortSignal;
};
export type ApplyBillingPlanParams = {
	request: ApplyBillingPlanRequest;
	signal?: AbortSignal;
};
export type InitializeParams = {
	request: InitializeRequest;
	signal?: AbortSignal;
};
export type BalanceWorkerClient = {
	track(params: TrackParams): Promise<TrackReply>;
	check(params: CheckParams): Promise<CheckReply>;
	readSubjectState(
		params: ReadSubjectStateParams,
	): Promise<ReadSubjectStateReply>;
	initialize(params: InitializeParams): Promise<InitializeReply>;
	applyBillingPlan(
		params: ApplyBillingPlanParams,
	): Promise<ApplyBillingPlanReply>;
	evict(params: EvictParams): Promise<EvictReply>;
	flush(params: FlushParams): Promise<FlushReply>;
	finalize(params: FinalizeParams): Promise<FinalizeReply>;
	confirmExpiredLock(
		params: ConfirmExpiredLockParams,
	): Promise<ConfirmExpiredLockReply>;
	reset(params: ResetParams): Promise<ResetReply>;
	updateBalance(params: UpdateBalanceParams): Promise<UpdateBalanceReply>;
	deleteBalance(params: DeleteBalanceParams): Promise<DeleteBalanceReply>;
	recalculateBalance(
		params: RecalculateBalanceParams,
	): Promise<RecalculateBalanceReply>;
	queue: CommandQueue;
	enqueue(params: EnqueueParams): Promise<void>;
	catalog: CatalogInvalidations;
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type ClientLifecycle = {
	start(): Promise<void>;
	stop(): Promise<void>;
};
export type BalanceWorkerClientDependencies = {
	owners: PartitionOwners;
	http?: HttpClient;
	commandLog?: CommandLog;
	catalogInvalidations?: CatalogInvalidations;
	lifecycle?: ClientLifecycle;
};
export type BalanceWorkerClientConfig = {
	partitionCount: number;
	timeoutMs: number;
	appendTimeoutMs?: number;
	routeRefreshTimeoutMs?: number;
	maxResponseBytes?: number;
	batchTracks?: boolean;
	maxTrackBatchSize?: number;
};
