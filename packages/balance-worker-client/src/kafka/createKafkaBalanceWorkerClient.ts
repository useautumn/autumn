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

/** The client any process uses to reach its workers: owners read from Kafka, commands queued on Kafka. */
export function createKafkaBalanceWorkerClient({
	ctx,
	config,
}: {
	/** `kafka` is for tests; a process lets the config build the real connection. */
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

	function start(): Promise<void> {
		return owners.start();
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
			routeRefreshTimeoutMs: config.routeRefreshTimeoutMs,
			batchTracks: config.batchTracks,
			maxTrackBatchSize: config.maxTrackBatchSize,
		},
	});
}
