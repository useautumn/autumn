import type {
	CheckCommand,
	CheckDecision,
	InitializationDecision,
	InitializeCommand,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type { HttpClient } from "../http/types/httpClient.js";
import type { PartitionOwners } from "../routing/types/routing.js";

export type TrackParams = { command: TrackCommand; signal?: AbortSignal };
export type CheckParams = { command: CheckCommand; signal?: AbortSignal };
export type InitializeParams = {
	command: InitializeCommand;
	signal?: AbortSignal;
};
export type BalanceWorkerClient = {
	track(params: TrackParams): Promise<TrackDecision>;
	check(params: CheckParams): Promise<CheckDecision>;
	initialize(params: InitializeParams): Promise<InitializationDecision>;
};
export type BalanceWorkerClientDependencies = {
	owners: PartitionOwners;
	http?: HttpClient;
};
export type BalanceWorkerClientConfig = {
	partitionCount: number;
	timeoutMs: number;
	maxResponseBytes?: number;
};
