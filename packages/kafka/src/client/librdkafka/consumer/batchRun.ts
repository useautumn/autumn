import type {
	EachBatchPayload,
	KafkaMessage,
	OffsetsByTopicPartition,
} from "../../types/kafkaWire.js";
import { type NativeDone, settleNative } from "../settleNative.js";
import { DEFAULT_MAX_POLL_INTERVAL_MS } from "./nativeConsumerConfig.js";
import { requestRestart } from "./requestRestart.js";
import { KafkaConsumerLeaseLostError } from "./runnerErrors.js";
import type { NativeMessage } from "./types/nativeConsumer.js";
import {
	type ConsumerRunnerScope,
	partitionKeyOf,
} from "./types/runnerState.js";

function headersOf(message: NativeMessage): KafkaMessage["headers"] {
	const headers: NonNullable<KafkaMessage["headers"]> = {};
	for (const header of message.headers ?? []) {
		for (const [name, value] of Object.entries(header)) {
			const buffer = typeof value === "string" ? Buffer.from(value) : value;
			const existing = headers[name];
			if (existing === undefined) headers[name] = buffer;
			else if (Array.isArray(existing)) existing.push(buffer);
			else headers[name] = [existing, buffer];
		}
	}
	return headers;
}

export function kafkaMessageOf(message: NativeMessage): KafkaMessage {
	return {
		key:
			typeof message.key === "string"
				? Buffer.from(message.key)
				: (message.key ?? null),
		value: message.value,
		timestamp: message.timestamp === undefined ? "" : String(message.timestamp),
		attributes: 0,
		offset: String(message.offset),
		headers: headersOf(message),
		size: message.size,
	};
}

/** librdkafka caches the watermark of its latest fetch response, and a failed one (a leader move) caches -1.
 *  What was delivered still proves the log reaches `floor`, so the watermark never reads below it. */
export function highWatermarkOf({
	scope,
	topic,
	partition,
	floor,
}: {
	scope: ConsumerRunnerScope;
	topic: string;
	partition: number;
	floor: number;
}): string {
	try {
		const high = scope.state.native?.getWatermarkOffsets(
			topic,
			partition,
		).highOffset;
		if (typeof high === "number" && high >= floor) return String(high);
	} catch {
		// The cached watermark is advisory; the delivered position stands in for it.
	}
	return String(floor);
}

function uncommittedOffsetsOf({
	scope,
}: {
	scope: ConsumerRunnerScope;
}): OffsetsByTopicPartition {
	const byTopic = new Map<string, { partition: number; offset: string }[]>();
	for (const [key, offset] of scope.state.resolved) {
		if (scope.state.committed.get(key) === offset) continue;
		const assigned = scope.state.assigned.get(key);
		if (!assigned) continue;
		const partitions = byTopic.get(assigned.topic) ?? [];
		partitions.push({ partition: assigned.partition, offset });
		byTopic.set(assigned.topic, partitions);
	}
	const topics: OffsetsByTopicPartition["topics"] = [];
	for (const [topic, partitions] of byTopic) topics.push({ topic, partitions });
	return { topics };
}

export async function commitTopicOffsets({
	scope,
	offsets,
}: {
	scope: ConsumerRunnerScope;
	offsets: OffsetsByTopicPartition;
}): Promise<void> {
	const native = scope.state.native;
	const flat: { topic: string; partition: number; offset: number }[] = [];
	for (const { topic, partitions } of offsets.topics)
		for (const { partition, offset } of partitions)
			flat.push({ topic, partition, offset: Number(offset) });
	if (!native || flat.length === 0) return;
	function commit(done: NativeDone): void {
		native?.commitCb(flat, done);
	}
	await settleNative(commit);
	for (const { topic, partition, offset } of flat)
		scope.state.committed.set(
			partitionKeyOf({ topic, partition }),
			String(offset),
		);
}

/** Past this share of max.poll.interval.ms without a poll, a batch treats its lease as gone. */
const POLL_DEADLINE_SHARE = 0.9;

function isPollOverdue({ scope }: { scope: ConsumerRunnerScope }): boolean {
	const intervalMs =
		scope.config.rebalanceTimeout ?? DEFAULT_MAX_POLL_INTERVAL_MS;
	return (
		performance.now() - scope.state.lastPollAt >
		intervalMs * POLL_DEADLINE_SHARE
	);
}

export type BatchRun = {
	payload: EachBatchPayload;
	/** The highest offset the handler resolved, or null. */
	lastResolved(): bigint | null;
	/** True when the handler seeked this partition while the batch ran. */
	seeked(): boolean;
};

export function createBatchRun({
	scope,
	topic,
	partition,
	messages,
	endOffset,
}: {
	scope: ConsumerRunnerScope;
	topic: string;
	partition: number;
	messages: NativeMessage[];
	/** Where the fetch ended, when it ran past the last record over markers librdkafka hides. */
	endOffset?: number;
}): BatchRun {
	const { state } = scope;
	const key = partitionKeyOf({ topic, partition });
	const generation = state.generation.get(key) ?? 0;
	const seekEpoch = state.seekEpoch.get(key) ?? 0;
	const converted: KafkaMessage[] = [];
	for (const message of messages) converted.push(kafkaMessageOf(message));
	let lastResolved: bigint | null = null;

	/** A seek or a lost lease ends the batch, as kafkajs's batch went stale on a seek or a failed heartbeat. */
	function isStale(): boolean {
		return (
			(state.generation.get(key) ?? 0) !== generation ||
			(state.seekEpoch.get(key) ?? 0) !== seekEpoch ||
			!state.assigned.has(key)
		);
	}

	function isRunning(): boolean {
		return state.running && !state.leaving;
	}

	function resolveOffset(offset: string): void {
		const resolved = BigInt(offset);
		if (lastResolved !== null && resolved <= lastResolved) return;
		lastResolved = resolved;
		if (!isStale()) state.resolved.set(key, String(resolved + 1n));
	}

	/** librdkafka heartbeats on its own, but a member that stops polling is evicted all the same; a batch that
	 *  outlives the poll interval has lost its lease, and the rewind to the last commit keeps its records. */
	async function heartbeat(): Promise<void> {
		if (isPollOverdue({ scope }))
			requestRestart({
				scope,
				cause: new KafkaConsumerLeaseLostError({ topic, partition }),
				pollFirst: true,
			});
		if (isStale()) throw new KafkaConsumerLeaseLostError({ topic, partition });
	}

	function resumePartition(): void {
		state.paused.delete(key);
		state.native?.resume([{ topic, partition }]);
	}

	function pause(): () => void {
		state.paused.add(key);
		state.native?.pause([{ topic, partition }]);
		return resumePartition;
	}

	async function commitOffsetsIfNecessary(
		offsets?: OffsetsByTopicPartition,
	): Promise<void> {
		await commitTopicOffsets({
			scope,
			offsets: offsets ?? uncommittedOffsetsOf({ scope }),
		});
	}

	function uncommittedOffsets(): OffsetsByTopicPartition {
		return uncommittedOffsetsOf({ scope });
	}

	function isEmpty(): boolean {
		return converted.length === 0;
	}

	function firstOffset(): string | null {
		return converted[0]?.offset ?? null;
	}

	function lastOffset(): string {
		const last = converted.at(-1)?.offset ?? "-1";
		if (endOffset === undefined || endOffset - 1 <= Number(last)) return last;
		return String(endOffset - 1);
	}

	function readLastResolved(): bigint | null {
		return lastResolved;
	}

	function seeked(): boolean {
		return (state.seekEpoch.get(key) ?? 0) !== seekEpoch;
	}

	const payload: EachBatchPayload = {
		batch: {
			topic,
			partition,
			highWatermark: highWatermarkOf({
				scope,
				topic,
				partition,
				floor: Number(lastOffset()) + 1,
			}),
			messages: converted,
			isEmpty,
			firstOffset,
			lastOffset,
		},
		resolveOffset,
		heartbeat,
		pause,
		commitOffsetsIfNecessary,
		uncommittedOffsets,
		isRunning,
		isStale,
	};
	return { payload, lastResolved: readLastResolved, seeked };
}
