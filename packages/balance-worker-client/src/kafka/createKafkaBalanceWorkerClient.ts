import { createBalanceWorkerClient } from "../createBalanceWorkerClient.js";
import type { BalanceWorkerClient } from "../types/balanceWorkerClient.js";
import { createBalanceWorkerKafka } from "./createBalanceWorkerKafka.js";
import { createCatalogInvalidationsFromKafka } from "./createCatalogInvalidationsFromKafka.js";
import { createCommandLogFromKafka } from "./createCommandLogFromKafka.js";
import { createOwnersFromKafka } from "./createOwnersFromKafka.js";
import type {
	BalanceWorkerKafka,
	ClientLogger,
	KafkaBalanceWorkerClientConfig,
} from "./types/kafkaBalanceWorkerClient.js";

export function createKafkaBalanceWorkerClient({
	ctx,
	config,
}: {
	ctx: { logger?: ClientLogger; kafka?: BalanceWorkerKafka };
	config: KafkaBalanceWorkerClientConfig;
}): BalanceWorkerClient {
	const kafka = ctx.kafka ?? createBalanceWorkerKafka(config.kafka);
	const owners = createOwnersFromKafka({
		ctx: { kafka, logger: ctx.logger },
		config: {
			topic: config.ownershipTopic,
			groupIdPrefix: config.groupIdPrefix,
			catchUpTimeoutMs: config.catchUpTimeoutMs,
			startRetryDelaysMs: config.startRetryDelaysMs,
		},
	});
	const commandLog = createCommandLogFromKafka({
		ctx: { kafka },
		config: { topic: config.commandTopic },
	});
	const catalogInvalidations = createCatalogInvalidationsFromKafka({
		ctx: { kafka },
		config: { topic: config.catalogInvalidationTopic },
	});

	async function connectProducers(): Promise<void> {
		for (const [name, producer] of [
			["command log", commandLog],
			["catalog invalidations", catalogInvalidations],
		] as const) {
			try {
				await producer.connect();
			} catch (cause) {
				ctx.logger?.warn(
					{ error: cause },
					`[balance-worker-client] ${name} producer did not connect at start; the first append will retry`,
				);
			}
		}
	}

	async function start(): Promise<void> {
		await owners.start();
		if (config.connectProducersOnStart) await connectProducers();
	}

	async function stop(): Promise<void> {
		await owners.stop();
		await commandLog.stop();
		await catalogInvalidations.stop();
	}

	return createBalanceWorkerClient({
		ctx: {
			owners,
			commandLog,
			catalogInvalidations,
			lifecycle: { start, stop },
		},
		config: {
			partitionCount: config.partitionCount,
			timeoutMs: config.timeoutMs,
			appendTimeoutMs: config.appendTimeoutMs,
			routeRefreshTimeoutMs: config.routeRefreshTimeoutMs,
			batchTracks: config.batchTracks,
			maxTrackBatchSize: config.maxTrackBatchSize,
		},
	});
}
