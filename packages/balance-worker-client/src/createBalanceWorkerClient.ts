import { sendTrack } from "./commands/sendTrack.js";
import { createHttpClient } from "./http/createHttpClient.js";
import type {
	BalanceWorkerClient,
	BalanceWorkerClientConfig,
	BalanceWorkerClientDependencies,
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

	return { track };
}
