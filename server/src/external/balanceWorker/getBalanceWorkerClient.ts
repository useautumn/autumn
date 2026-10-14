import { hostname } from "node:os";
import {
	type BalanceWorkerClient,
	createKafkaBalanceWorkerClient,
	createProxyBalanceWorkerClient,
	type KafkaBalanceWorkerClientConfig,
} from "@autumn/balance-worker-client";
import { getAutumnEnv } from "@autumn/env";
import {
	getBalanceWorkerClientEnv,
	getBalanceWorkerTransportEnv,
} from "@autumn/env/balanceWorkerClient";
import {
	BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
	BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { logger } from "@/external/logtail/logtailUtils.js";
import { readBalanceWorkerKafkaConfig } from "./balanceWorkerKafkaConfig.js";
import { markBalanceWorkerRoutingSettled } from "./balanceWorkerRoutingStartup.js";
import { getBalanceWorkerRolloutOverride } from "./getBalanceWorkerRolloutEnabled.js";

const rolloutOverrideLabel = (): string => {
	const override = getBalanceWorkerRolloutOverride();
	if (override === undefined) return "config";
	return override ? "on" : "off";
};

let balanceWorkerClient: BalanceWorkerClient | undefined;

function balanceWorkerClientConfig(): KafkaBalanceWorkerClientConfig {
	const env = getBalanceWorkerClientEnv();
	return {
		kafka: readBalanceWorkerKafkaConfig({
			clientId: "autumn-server-balance-worker",
		}),
		ownershipTopic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
		commandTopic: env.BALANCE_WORKER_COMMAND_TOPIC,
		catalogInvalidationTopic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
		groupIdPrefix: "autumn-server-ownership",
		partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
		catchUpTimeoutMs: BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
		connectProducersOnStart: true,
	};
}

function createProxyClient(): BalanceWorkerClient {
	const secret = getBalanceWorkerTransportEnv().BALANCE_WORKER_PROXY_SECRET;
	if (!secret)
		throw new Error(
			"BALANCE_WORKER_PROXY_SECRET is required to reach the balance worker from outside the VPC",
		);
	return createProxyBalanceWorkerClient({
		ctx: {},
		config: {
			url: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
			secret,
			caller: hostname().slice(0, 64),
		},
	});
}

function createClientForTransport(): BalanceWorkerClient {
	if (getBalanceWorkerTransportEnv().BALANCE_WORKER_TRANSPORT === "proxy")
		return createProxyClient();
	return createKafkaBalanceWorkerClient({
		ctx: { logger },
		config: balanceWorkerClientConfig(),
	});
}

export function getBalanceWorkerClient(): BalanceWorkerClient {
	balanceWorkerClient ??= createClientForTransport();
	return balanceWorkerClient;
}

export async function startBalanceWorkerClient(): Promise<void> {
	logger.info(
		`[balance-worker] Client starting; rollout ${rolloutOverrideLabel()}`,
	);
	try {
		await getBalanceWorkerClient().start();
	} finally {
		markBalanceWorkerRoutingSettled();
	}
}

export async function stopBalanceWorkerClient(): Promise<void> {
	const running = balanceWorkerClient;
	balanceWorkerClient = undefined;
	await running?.stop();
}
