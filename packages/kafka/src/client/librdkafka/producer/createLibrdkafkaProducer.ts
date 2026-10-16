import type { KafkaJS } from "@autumn/librdkafka";
import { isKafkaRefusalOfUnwritten } from "../../kafkaErrorClassification.js";
import {
	KafkaDeliveryReportOverdueError,
	KafkaPartialDeliveryError,
	KafkaProducerClosedError,
} from "../../kafkaErrors.js";
import type {
	KafkaProducerStatistics,
	KafkaRequestTiming,
} from "../../types/kafkaClient.js";
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
import {
	createProducerStatisticsReader,
	type LibrdkafkaStatistics,
} from "./producerStatistics.js";

const COMPRESSION_CODECS: Record<number, string> = {
	[CompressionTypes.None]: "none",
	[CompressionTypes.GZIP]: "gzip",
	[CompressionTypes.Snappy]: "snappy",
	[CompressionTypes.LZ4]: "lz4",
	[CompressionTypes.ZSTD]: "zstd",
};
const STATISTICS_INTERVAL_MS = 10_000;
const MAX_INT32 = 2_147_483_647;

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
		// The KafkaJS shim would otherwise force 5. An idempotent producer keeps librdkafka's own unbounded
		// count so only the message timeout ends a send, as one fate-unknown error rather than a broker code.
		retries: (config.idempotent ?? transactional) ? MAX_INT32 : retry.retries,
		"retry.backoff.ms": retry.initialRetryTime,
		"retry.backoff.max.ms": retry.maxRetryTime,
		"allow.auto.create.topics": config.allowAutoTopicCreation ?? false,
		"statistics.interval.ms": STATISTICS_INTERVAL_MS,
	};
}

/**
 * Per-broker request latency out of one librdkafka statistics document: the window's p99, so a broker
 * that held its requests for a second or two shows up, where the window's average (a 10s window of
 * mostly fast requests) hid it.
 */
export function requestTimingsOf({
	document,
}: {
	document: LibrdkafkaStatistics;
}): KafkaRequestTiming[] {
	const timings: KafkaRequestTiming[] = [];
	for (const [name, broker] of Object.entries(document.brokers ?? {})) {
		if ((broker.nodeid ?? -1) < 0 || !broker.rtt?.cnt) continue;
		timings.push({
			apiName: "Produce",
			broker: name,
			durationMs: (broker.rtt.p99 ?? 0) / 1000,
			pendingMs: (broker.outbuf_latency?.p99 ?? 0) / 1000,
		});
	}
	return timings;
}

/** One metadata per partition: its lowest offset as `baseOffset` and its highest as `lastOffset`. */
export function spanOf({
	outcomes,
}: {
	outcomes: PromiseSettledResult<RecordMetadata[]>[];
}): RecordMetadata[] {
	const failures: unknown[] = [];
	let delivered = 0;
	const byPartition = new Map<string, RecordMetadata & { offsets: bigint[] }>();
	for (const outcome of outcomes) {
		if (outcome.status === "rejected") {
			failures.push(outcome.reason);
			continue;
		}
		delivered += 1;
		for (const metadata of outcome.value) {
			const key = `${metadata.topicName}\u0000${metadata.partition}`;
			const span = byPartition.get(key) ?? { ...metadata, offsets: [] };
			if (metadata.baseOffset !== undefined)
				span.offsets.push(BigInt(metadata.baseOffset));
			byPartition.set(key, span);
		}
	}
	const [failure] = failures;
	if (failure !== undefined) {
		if (delivered > 0)
			throw new KafkaPartialDeliveryError({
				delivered,
				total: outcomes.length,
				failure,
			});
		throw failures.find(isFateUnknown) ?? failure;
	}
	const spans: RecordMetadata[] = [];
	for (const { offsets, ...metadata } of byPartition.values()) {
		if (offsets.length === 0) {
			spans.push(metadata);
			continue;
		}
		let low = offsets[0] as bigint;
		let high = low;
		for (const offset of offsets) {
			if (offset < low) low = offset;
			if (offset > high) high = offset;
		}
		spans.push({
			...metadata,
			baseOffset: low.toString(),
			lastOffset: high.toString(),
		});
	}
	return spans;
}

/** A client-side failure (a timeout, a lost connection) or a refusal of a record possibly appended leaves its fate
 *  unknown; it outranks a refusal that proves nothing was written. */
function isFateUnknown(cause: unknown): boolean {
	return !isKafkaRefusalOfUnwritten({ cause });
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
	onStatistics(listener: (statistics: KafkaProducerStatistics) => void): void;
};

/** Past the message timeout, how long a delivery report may still take to reach JS before it counts as lost. */
const DELIVERY_REPORT_MARGIN_MS = 5_000;

async function ignoreOutcome(sent: Promise<unknown>): Promise<void> {
	try {
		await sent;
	} catch {
		// The withheld report is the fault under test.
	}
}

/** `LIBRDKAFKA_TEST_WITHHOLD_DELIVERY=<topic substring>:<partition>:<from send n>`, honoured only under NODE_ENV=test. */
export function withheldDeliveryOf({
	env,
}: {
	env: Record<string, string | undefined>;
}): { topic: string; partition: number; fromSend: number } | null {
	const spec = env.LIBRDKAFKA_TEST_WITHHOLD_DELIVERY;
	if (!spec || env.NODE_ENV !== "test") return null;
	const [topic, partition, fromSend] = spec.split(":");
	if (!topic || partition === undefined || fromSend === undefined) return null;
	return { topic, partition: Number(partition), fromSend: Number(fromSend) };
}

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
	const statisticsListeners = new Set<
		(statistics: KafkaProducerStatistics) => void
	>();
	const statisticsReader = createProducerStatisticsReader();
	function receiveStatistics({ message }: { message: string }): void {
		if (listeners.size === 0 && statisticsListeners.size === 0) return;
		try {
			const document = JSON.parse(message) as LibrdkafkaStatistics;
			for (const timing of requestTimingsOf({ document }))
				for (const listener of listeners) listener(timing);
			const statistics = statisticsReader.read({ document });
			for (const listener of statisticsListeners) listener(statistics);
		} catch {
			// Timing is telemetry; it must never fail a produce.
		}
	}
	const nativeConfig = nativeProducerConfigOf({
		config,
		defaults: ctx.defaults,
	});
	// librdkafka reports every record by its message timeout; a report later than that was lost on its way to JS.
	const deliveryDeadlineMs =
		Number(nativeConfig["message.timeout.ms"]) + DELIVERY_REPORT_MARGIN_MS;
	const withheld = withheldDeliveryOf({ env: process.env });
	let sendsToWithheldPartition = 0;
	const producer = ctx.kafka.producer({
		...ctx.nativeClientConfig,
		...nativeConfig,
		stats_cb: receiveStatistics,
		kafkaJS: { logger: ctx.log.shim },
	} as KafkaJS.ProducerConstructorConfig);

	function connect(): Promise<void> {
		return producer.connect();
	}

	// librdkafka drops the delivery reports still queued when the client closes, so their sends would never settle.
	const closed = Promise.withResolvers<never>();
	async function observeClosed(): Promise<void> {
		try {
			await closed.promise;
		} catch {
			// Each send racing it reports the close; nothing waits on it otherwise.
		}
	}
	void observeClosed();

	async function disconnect(): Promise<void> {
		try {
			await producer.disconnect();
		} finally {
			closed.reject(new KafkaProducerClosedError());
		}
	}

	function sendOne(
		message: ProducerRecord["messages"][number],
		topic: string,
	): Promise<RecordMetadata[]> {
		const sent = producer.send({ topic, messages: [message] }) as Promise<
			RecordMetadata[]
		>;
		if (withholds({ topic, partition: message.partition })) {
			void ignoreOutcome(sent);
			return closed.promise;
		}
		return Promise.race([sent, closed.promise]);
	}

	/** Test-only fault: from the configured send on, a partition's delivery reports never reach JS. */
	function withholds({
		topic,
		partition,
	}: {
		topic: string;
		partition: number | undefined;
	}): boolean {
		if (!withheld || partition !== withheld.partition) return false;
		if (!topic.includes(withheld.topic)) return false;
		sendsToWithheldPartition += 1;
		return sendsToWithheldPartition >= withheld.fromSend;
	}

	/** A send that outlives its delivery deadline lost its report: its fate is unknown, never pending forever. */
	async function settleWithinDeadline({
		topic,
		sends,
	}: {
		topic: string;
		sends: Promise<RecordMetadata[]>[];
	}): Promise<PromiseSettledResult<RecordMetadata[]>[]> {
		const overdue = Promise.withResolvers<"overdue">();
		const timer = setTimeout(overdue.resolve, deliveryDeadlineMs, "overdue");
		timer.unref?.();
		try {
			const outcome = await Promise.race([
				Promise.allSettled(sends),
				overdue.promise,
			]);
			if (outcome !== "overdue") return outcome;
		} finally {
			clearTimeout(timer);
		}
		ctx.log.write(
			"error",
			"Kafka delivery report overdue; the send's fate is unknown",
			{ topic, records: sends.length, deadlineMs: deliveryDeadlineMs },
		);
		throw new KafkaDeliveryReportOverdueError({
			topic,
			deadlineMs: deliveryDeadlineMs,
		});
	}

	/** librdkafka may split one send into several record batches, so each record's outcome is read on its own:
	 *  a send only some of which landed is never reported as a refusal, and each partition reports its span. */
	async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
		if (record.acks !== undefined && record.acks !== -1)
			throw new RangeError(
				"Every producer of ours acks with all in-sync replicas",
			);
		const sends: Promise<RecordMetadata[]>[] = [];
		for (const message of record.messages)
			sends.push(sendOne(message, record.topic));
		return spanOf({
			outcomes: await settleWithinDeadline({ topic: record.topic, sends }),
		});
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

	function onStatistics(
		listener: (statistics: KafkaProducerStatistics) => void,
	): void {
		statisticsListeners.add(listener);
	}

	return {
		connect,
		disconnect,
		send,
		transaction,
		onRequestTimings,
		onStatistics,
	};
}
