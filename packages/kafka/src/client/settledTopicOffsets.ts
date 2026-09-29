import {
	type Admin,
	type AdminConfig,
	Kafka,
	type KafkaConfig,
	KafkaJSNumberOfRetriesExceeded,
} from "kafkajs";
import { KafkaTopicPartitionsUnavailableError } from "./kafkaErrors.js";

/**
 * kafkajs keeps one Metadata reply per client for metadataMaxAge, five minutes
 * by default, and only asks again early when a topic is missing from it. A
 * reply that lists the topic with no partitions, which brokers hand out for a
 * moment while a whole fleet connects at once, is therefore kept for the full
 * five minutes: every fetchTopicOffsets on that client finds the topic, maps
 * zero partitions, and pops an empty result into a TypeError. The client's own
 * retries hit the same cache, so the worker used to give up and exit, and the
 * replacement task succeeded only because it was a new process.
 *
 * A settled admin retries the read on a fresh admin, whose own metadata fetch
 * starts from nothing, until the topic reports partitions or a deadline
 * passes. The poisoned admin is kept until disconnect so callers mid-flight on
 * it are not cut off.
 */
export type TopicOffsetsRetry = {
	deadlineMs: number;
	backoffMs: number;
	sleep(ms: number): Promise<void>;
	now(): number;
};

function sleepFor(ms: number): Promise<void> {
	const wake = Promise.withResolvers<void>();
	setTimeout(wake.resolve, ms);
	return wake.promise;
}

function monotonicNow(): number {
	return performance.now();
}

const DEFAULT_TOPIC_OFFSETS_RETRY: TopicOffsetsRetry = {
	deadlineMs: 10_000,
	backoffMs: 500,
	sleep: sleepFor,
	now: monotonicNow,
};

const EMPTY_PARTITIONS_MESSAGE = "Cannot destructure property 'partitions'";

/** The TypeError kafkajs throws on a cached reply without partitions, bare or after its own retries. */
export function isEmptyTopicMetadataFailure(cause: unknown): boolean {
	if (cause instanceof KafkaJSNumberOfRetriesExceeded)
		return isEmptyTopicMetadataFailure(cause.cause);
	return (
		cause instanceof TypeError &&
		cause.message.includes(EMPTY_PARTITIONS_MESSAGE)
	);
}

type TopicOffsets = Awaited<ReturnType<Admin["fetchTopicOffsets"]>>;

type SettledAdminState = {
	current: Admin;
	retired: Admin[];
	connected: boolean;
	replacing: Promise<void> | undefined;
};

export function createSettledAdmin({
	createAdmin,
	retry = DEFAULT_TOPIC_OFFSETS_RETRY,
}: {
	createAdmin(): Admin;
	retry?: TopicOffsetsRetry;
}): Admin {
	const state: SettledAdminState = {
		current: createAdmin(),
		retired: [],
		connected: false,
		replacing: undefined,
	};

	async function connect(): Promise<void> {
		await state.current.connect();
		state.connected = true;
	}

	async function disconnect(): Promise<void> {
		state.connected = false;
		await state.replacing;
		const admins = [state.current, ...state.retired];
		state.retired = [];
		for (const admin of admins) await admin.disconnect();
	}

	async function replaceAdmin(): Promise<void> {
		const fresh = createAdmin();
		if (state.connected) await fresh.connect();
		state.retired.push(state.current);
		state.current = fresh;
	}

	/** Concurrent readers of one poisoned reply share a single replacement. */
	async function replaceAdminOnce(): Promise<void> {
		state.replacing ??= replaceAdmin();
		try {
			await state.replacing;
		} finally {
			state.replacing = undefined;
		}
	}

	async function fetchTopicOffsets(topic: string): Promise<TopicOffsets> {
		const startedAt = retry.now();
		for (;;) {
			let cause: unknown;
			try {
				const offsets = await state.current.fetchTopicOffsets(topic);
				if (offsets.length > 0) return offsets;
				cause = new Error(`Kafka listed ${topic} with no partitions`);
			} catch (error) {
				if (!isEmptyTopicMetadataFailure(error)) throw error;
				cause = error;
			}
			const waitedMs = retry.now() - startedAt;
			if (waitedMs + retry.backoffMs > retry.deadlineMs)
				throw new KafkaTopicPartitionsUnavailableError({ topic, cause });
			await retry.sleep(retry.backoffMs);
			await replaceAdminOnce();
		}
	}

	const overrides: Pick<Admin, "connect" | "disconnect" | "fetchTopicOffsets"> =
		{ connect, disconnect, fetchTopicOffsets };

	/** Everything else reads through to whichever admin is current, so a
	 *  replacement also heals the other metadata-backed calls. */
	function readMember(_target: Admin, property: string | symbol): unknown {
		if (typeof property === "string" && property in overrides)
			return overrides[property as keyof typeof overrides];
		return Reflect.get(state.current, property);
	}

	return new Proxy(state.current, { get: readMember });
}

/** A Kafka client whose admins settle topic offsets before answering. */
export class KafkaWithSettledTopicOffsets extends Kafka {
	readonly #retry: TopicOffsetsRetry;

	constructor(config: KafkaConfig, retry?: TopicOffsetsRetry) {
		super(config);
		this.#retry = retry ?? DEFAULT_TOPIC_OFFSETS_RETRY;
	}

	override admin(config?: AdminConfig): Admin {
		const kafka = this;
		function createPlainAdmin(): Admin {
			return Kafka.prototype.admin.call(kafka, config);
		}
		return createSettledAdmin({
			createAdmin: createPlainAdmin,
			retry: this.#retry,
		});
	}
}
