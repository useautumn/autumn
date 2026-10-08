import type { KafkaJS } from "@autumn/librdkafka";
import type { KafkaRequestTiming } from "../../types/kafkaClient.js";
import {
	CompressionTypes,
	type ProducerConfig,
	type ProducerRecord,
	type RecordMetadata,
	type Transaction,
} from "../../types/kafkaWire.js";
import { nativeConsumerOf } from "../consumer/nativeConsumerRegistry.js";
import type { KafkaLog } from "../kafkaLog.js";
import { retryWindowMs } from "../nativeClientConfig.js";

const COMPRESSION_CODECS: Record<number, string> = {
	[CompressionTypes.None]: "none",
	[CompressionTypes.GZIP]: "gzip",
	[CompressionTypes.Snappy]: "snappy",
	[CompressionTypes.LZ4]: "lz4",
	[CompressionTypes.ZSTD]: "zstd",
};
const STATISTICS_INTERVAL_MS = 10_000;

export type ProducerDefaults = {
	requestTimeout: number;
	retry: { retries: number; initialRetryTime: number; maxRetryTime: number };
};

/** librdkafka producer properties for a kafkajs-shaped producer config. */
export function nativeProducerConfigOf({
	config,
	defaults,
}: {
	config: ProducerConfig;
	defaults: ProducerDefaults;
}): Record<string, unknown> {
	const retry = { ...defaults.retry, ...config.retry };
	const transactional = config.transactionalId !== undefined;
	const window = retryWindowMs({
		retries: retry.retries,
		initialRetryTime: retry.initialRetryTime,
		maxRetryTime: retry.maxRetryTime,
		requestTimeout: defaults.requestTimeout,
	});
	return {
		"enable.idempotence": config.idempotent ?? transactional,
		...(transactional && { "transactional.id": config.transactionalId }),
		...(config.transactionTimeout && {
			"transaction.timeout.ms": config.transactionTimeout,
		}),
		"max.in.flight.requests.per.connection": config.maxInFlightRequests ?? 5,
		acks: -1,
		"compression.codec":
			COMPRESSION_CODECS[config.compression ?? CompressionTypes.GZIP],
		// A send's records are queued in one tick; a millisecond keeps them in one record batch.
		"linger.ms": config.lingerMs ?? 1,
		// Mirrors kafkajs's per-key partitioning, for sends that leave the partition to the client.
		partitioner: "murmur2_random",
		// librdkafka refuses a transactional producer whose sends could outlive its transaction.
		"message.timeout.ms":
			transactional && config.transactionTimeout
				? Math.min(window, config.transactionTimeout)
				: window,
		"retry.backoff.ms": retry.initialRetryTime,
		"retry.backoff.max.ms": retry.maxRetryTime,
		"allow.auto.create.topics": config.allowAutoTopicCreation ?? false,
		"statistics.interval.ms": STATISTICS_INTERVAL_MS,
	};
}

/** Per-broker request latency out of one librdkafka statistics document. */
export function requestTimingsOf({
	statistics,
}: {
	statistics: string;
}): KafkaRequestTiming[] {
	const parsed = JSON.parse(statistics) as {
		brokers?: Record<
			string,
			{
				nodeid?: number;
				rtt?: { avg?: number };
				outbuf_latency?: { avg?: number };
			}
		>;
	};
	const timings: KafkaRequestTiming[] = [];
	for (const [name, broker] of Object.entries(parsed.brokers ?? {})) {
		if ((broker.nodeid ?? -1) < 0 || !broker.rtt?.avg) continue;
		timings.push({
			apiName: "Produce",
			broker: name,
			durationMs: broker.rtt.avg / 1000,
			pendingMs: (broker.outbuf_latency?.avg ?? 0) / 1000,
		});
	}
	return timings;
}

function messagesOf(record: ProducerRecord): KafkaJS.ProducerRecord {
	return { topic: record.topic, messages: record.messages };
}

export type LibrdkafkaProducer = {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	send(record: ProducerRecord): Promise<RecordMetadata[]>;
	transaction(): Promise<Transaction>;
	onRequestTimings(listener: (timing: KafkaRequestTiming) => void): void;
};

/** Confluent's KafkaJS producer with our sends' per-send `acks`/`compression` folded into its config. */
export function createLibrdkafkaProducer({
	ctx,
	config,
}: {
	ctx: {
		kafka: KafkaJS.Kafka;
		nativeClientConfig: Record<string, unknown>;
		defaults: ProducerDefaults;
		log: KafkaLog;
	};
	config: ProducerConfig;
}): LibrdkafkaProducer {
	const listeners = new Set<(timing: KafkaRequestTiming) => void>();
	function onStatistics({ message }: { message: string }): void {
		if (listeners.size === 0) return;
		try {
			for (const timing of requestTimingsOf({ statistics: message }))
				for (const listener of listeners) listener(timing);
		} catch {
			// Timing is telemetry; it must never fail a produce.
		}
	}
	const producer = ctx.kafka.producer({
		...ctx.nativeClientConfig,
		...nativeProducerConfigOf({ config, defaults: ctx.defaults }),
		stats_cb: onStatistics,
		kafkaJS: { logger: ctx.log.shim },
	} as KafkaJS.ProducerConstructorConfig);

	function connect(): Promise<void> {
		return producer.connect();
	}

	function disconnect(): Promise<void> {
		return producer.disconnect();
	}

	function send(record: ProducerRecord): Promise<RecordMetadata[]> {
		if (record.acks !== undefined && record.acks !== -1)
			throw new RangeError(
				"Every producer of ours acks with all in-sync replicas",
			);
		return producer.send(messagesOf(record)) as Promise<RecordMetadata[]>;
	}

	async function transaction(): Promise<Transaction> {
		const current = await producer.transaction();
		function sendInTransaction(
			record: ProducerRecord,
		): Promise<RecordMetadata[]> {
			return current.send(messagesOf(record)) as Promise<RecordMetadata[]>;
		}
		async function sendOffsets({
			consumer,
			topics,
		}: Parameters<Transaction["sendOffsets"]>[0]): Promise<void> {
			const native = nativeConsumerOf({ consumer });
			if (!native)
				throw new Error("sendOffsets needs a running consumer of ours");
			function readNative(): unknown {
				return native;
			}
			await current.sendOffsets({
				consumer: {
					_getInternalClient: readNative,
				} as unknown as KafkaJS.Consumer,
				topics,
			});
		}
		function commit(): Promise<void> {
			return current.commit();
		}
		function abort(): Promise<void> {
			return current.abort();
		}
		return { send: sendInTransaction, sendOffsets, commit, abort };
	}

	function onRequestTimings(
		listener: (timing: KafkaRequestTiming) => void,
	): void {
		listeners.add(listener);
	}

	return { connect, disconnect, send, transaction, onRequestTimings };
}
