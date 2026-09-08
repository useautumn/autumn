import { sendCheck } from "./commands/sendCheck.js";
import { sendInitialize } from "./commands/sendInitialize.js";
import { sendTrack } from "./commands/sendTrack.js";
import { createHttpClient } from "./http/createHttpClient.js";
import type {
	BalanceWorkerClient,
	BalanceWorkerClientConfig,
	BalanceWorkerClientDependencies,
	CheckParams,
	InitializeParams,
	TrackParams,
} from "./types/balanceWorkerClient.js";

export function createBalanceWorkerClient({
	ctx: dependencies,
	config,
}: {
	ctx: BalanceWorkerClientDependencies;
	config: BalanceWorkerClientConfig;
}): BalanceWorkerClient {
	const http =
		dependencies.http ??
		createHttpClient({
			config: { maxResponseBytes: config.maxResponseBytes ?? 1_048_576 },
		});

	const ctx = {
		owners: dependencies.owners,
		http,
		partitionCount: config.partitionCount,
		timeoutMs: config.timeoutMs,
	};

	function track(params: TrackParams) {
		return sendTrack({ ctx, ...params });
	}

	function check(params: CheckParams) {
		return sendCheck({ ctx, ...params });
	}

	function initialize(params: InitializeParams) {
		return sendInitialize({ ctx, ...params });
	}

	return { track, check, initialize };
}
