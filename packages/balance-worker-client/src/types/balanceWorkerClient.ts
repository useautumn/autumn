import type {
	CheckCommand,
	EvictCommand,
	FinalizeCommand,
	InitializeRequest,
	TrackCommand,
} from "@autumn/balance-engine";
import type { CheckReply } from "../contracts/check.js";
import type { EvictReply } from "../contracts/evict.js";
import type { FinalizeReply } from "../contracts/finalize.js";
import type { InitializeReply } from "../contracts/initialize.js";
import type { TrackReply } from "../contracts/track.js";
import type { HttpClient } from "../http/types/httpClient.js";
import type { PartitionOwners } from "../routing/types/routing.js";

export type TrackParams = { command: TrackCommand; signal?: AbortSignal };
export type CheckParams = { command: CheckCommand; signal?: AbortSignal };
export type EvictParams = { command: EvictCommand; signal?: AbortSignal };
export type FinalizeParams = { command: FinalizeCommand; signal?: AbortSignal };
export type InitializeParams = {
	request: InitializeRequest;
	signal?: AbortSignal;
};
export type BalanceWorkerClient = {
	track(params: TrackParams): Promise<TrackReply>;
	check(params: CheckParams): Promise<CheckReply>;
	initialize(params: InitializeParams): Promise<InitializeReply>;
	evict(params: EvictParams): Promise<EvictReply>;
	finalize(params: FinalizeParams): Promise<FinalizeReply>;
};
export type BalanceWorkerClientDependencies = {
	owners: PartitionOwners;
	http?: HttpClient;
};
export type BalanceWorkerClientConfig = {
	partitionCount: number;
	timeoutMs: number;
	/** Caps what an ownership refresh may take out of `timeoutMs`, so a rebalance
	 *  fails fast instead of spending a caller's whole budget. */
	routeRefreshTimeoutMs?: number;
	maxResponseBytes?: number;
};
