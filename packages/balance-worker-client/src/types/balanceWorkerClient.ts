import type {
	ApplyBillingPlanRequest,
	CheckCommand,
	ConfirmExpiredLockCommand,
	EvictCommand,
	FinalizeCommand,
	FlushCommand,
	InitializeRequest,
	ReadSubjectStateCommand,
	ResetCommand,
	TrackCommand,
} from "@autumn/balance-engine";
import type { CatalogInvalidations } from "../catalog/types/catalogInvalidations.js";
import type { ApplyBillingPlanReply } from "../contracts/applyBillingPlan.js";
import type { CheckReply } from "../contracts/check.js";
import type { ConfirmExpiredLockReply } from "../contracts/confirmExpiredLock.js";
import type { EvictReply } from "../contracts/evict.js";
import type { FinalizeReply } from "../contracts/finalize.js";
import type { FlushReply } from "../contracts/flush.js";
import type { InitializeReply } from "../contracts/initialize.js";
import type { ReadSubjectStateReply } from "../contracts/readSubjectState.js";
import type { ResetReply } from "../contracts/reset.js";
import type { TrackReply } from "../contracts/track.js";
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
	/** The subject's rows and catalog as its next command would see them; `customers.get` renders from them. */
	readSubjectState(
		params: ReadSubjectStateParams,
	): Promise<ReadSubjectStateReply>;
	initialize(params: InitializeParams): Promise<InitializeReply>;
	/** A billing plan's changes to one customer, answered once Postgres holds them. */
	applyBillingPlan(
		params: ApplyBillingPlanParams,
	): Promise<ApplyBillingPlanReply>;
	evict(params: EvictParams): Promise<EvictReply>;
	/** Answers once Postgres holds the customer's accepted writes; a caller about to read Postgres sends it first. */
	flush(params: FlushParams): Promise<FlushReply>;
	finalize(params: FinalizeParams): Promise<FinalizeReply>;
	confirmExpiredLock(
		params: ConfirmExpiredLockParams,
	): Promise<ConfirmExpiredLockReply>;
	/** Brings the subject's cycles up to the command's clock; the cron's way to refill an idle customer. */
	reset(params: ResetParams): Promise<ResetReply>;
	/** The async half: `queue.track` is to `track` what Kafka is to HTTP. */
	queue: CommandQueue;
	/** A mixed batch of commands; the typed doors on `queue` are the usual way in. */
	enqueue(params: EnqueueParams): Promise<void>;
	/** Tells every worker and herald that an org's catalog changed, so their cached rows are dropped. */
	catalog: CatalogInvalidations;
	/** Reads the ownership log through, retrying until it does; routing answers nothing before. */
	start(): Promise<void>;
	stop(): Promise<void>;
};

/** What a transport does at start and stop; a client over fakes has nothing to do. */
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
	/** The budget over a Kafka append (queued commands, catalog invalidations); nobody's request waits on these, so it is looser than `timeoutMs`. Default 3s. */
	appendTimeoutMs?: number;
	/** Caps what an ownership refresh may take out of `timeoutMs`, so a rebalance
	 *  fails fast instead of spending a caller's whole budget. */
	routeRefreshTimeoutMs?: number;
	maxResponseBytes?: number;
	/** Tracks for one partition share a `/v1/track-batch` request unless this is false. */
	batchTracks?: boolean;
	/** Most tracks one batch carries; defaults to 100. */
	maxTrackBatchSize?: number;
};
