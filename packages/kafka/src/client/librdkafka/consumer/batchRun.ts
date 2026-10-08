import type {
	EachBatchPayload,
	KafkaMessage,
	OffsetsByTopicPartition,
} from "../../types/kafkaWire.js";
import { type NativeDone, settleNative } from "../settleNative.js";
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

export function highWatermarkOf({
	scope,
	topic,
	partition,
}: {
	scope: ConsumerRunnerScope;
	topic: string;
	partition: number;
}): string {
	try {
		const high = scope.state.native?.getWatermarkOffsets(
			topic,
			partition,
		).highOffset;
		if (typeof high === "number" && high >= 0) return String(high);
	} catch {
		// The cached watermark is advisory; a batch without one is still a batch.
	}
	return "-1";
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

	function isStale(): boolean {
		return (
			(state.generation.get(key) ?? 0) !== generation ||
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

	async function heartbeat(): Promise<void> {
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
			highWatermark: highWatermarkOf({ scope, topic, partition }),
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
