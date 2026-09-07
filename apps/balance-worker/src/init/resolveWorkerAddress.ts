import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type {
	EcsContainerMetadata,
	WorkerAddress,
} from "./types/balanceWorker.js";

export async function resolveWorkerAddress({
	env,
}: {
	env: BalanceWorkerEnv;
}): Promise<WorkerAddress> {
	if (!env.ECS_CONTAINER_METADATA_URI_V4) {
		return {
			hostname: env.BALANCE_WORKER_HOST,
			endpoint: env.BALANCE_WORKER_ENDPOINT,
		};
	}

	const response = await fetch(env.ECS_CONTAINER_METADATA_URI_V4, {
		signal: AbortSignal.timeout(3_000),
		redirect: "error",
	});
	if (!response.ok)
		throw new Error(
			`ECS container metadata request failed: ${response.status}`,
		);
	const metadata: EcsContainerMetadata = await response.json();
	for (const network of metadata.Networks ?? []) {
		const address = network.IPv4Addresses?.[0];
		if (network.NetworkMode === "awsvpc" && address) {
			return {
				hostname: "0.0.0.0",
				endpoint: `http://${address}:${env.BALANCE_WORKER_PORT}`,
			};
		}
	}
	throw new Error(
		"ECS worker requires an awsvpc network with a private IPv4 address",
	);
}
