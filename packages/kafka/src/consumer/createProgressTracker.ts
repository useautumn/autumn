import type {
	HighWatermarkPosition,
	PartitionPosition,
	PartitionProgress,
	PositionWaiter,
	ProgressPosition,
	ProgressTracker,
	ProgressWait,
} from "./types/progress.js";

export function createProgressTracker(): ProgressTracker {
	const nextOffsets = new Map<string, bigint>();
	const highWatermarks = new Map<string, bigint>();
	const waiters = new Map<string, Set<PositionWaiter>>();

	function advance({ topic, partition, nextOffset }: ProgressPosition): void {
		validatePosition({ topic, partition, nextOffset });
		const key = positionKeyOf({ topic, partition });
		const current = nextOffsets.get(key);
		if (current !== undefined && current >= nextOffset) return;
		nextOffsets.set(key, nextOffset);
		const pending = waiters.get(key);
		if (!pending) return;
		for (const waiter of pending) {
			if (waiter.nextOffset > nextOffset) continue;
			pending.delete(waiter);
			waiter.removeAbortListener();
			waiter.resolve();
		}
		if (pending.size === 0) waiters.delete(key);
	}

	function read(position: PartitionPosition): bigint | null {
		validatePosition({ ...position, nextOffset: 0n });
		return nextOffsets.get(positionKeyOf(position)) ?? null;
	}

	function observeHighWatermark({
		topic,
		partition,
		highWatermark,
	}: HighWatermarkPosition): void {
		validatePosition({ topic, partition, nextOffset: highWatermark });
		const key = positionKeyOf({ topic, partition });
		const current = highWatermarks.get(key);
		if (current !== undefined && current >= highWatermark) return;
		highWatermarks.set(key, highWatermark);
	}

	function readProgress(position: PartitionPosition): PartitionProgress {
		validatePosition({ ...position, nextOffset: 0n });
		const key = positionKeyOf(position);
		return {
			consumedNextOffset: nextOffsets.get(key) ?? null,
			highWatermark: highWatermarks.get(key) ?? null,
		};
	}

	function waitUntil({
		topic,
		partition,
		nextOffset,
		signal,
	}: ProgressWait): Promise<void> {
		validatePosition({ topic, partition, nextOffset });
		const key = positionKeyOf({ topic, partition });
		const current = nextOffsets.get(key);
		if (current !== undefined && current >= nextOffset)
			return Promise.resolve();
		if (signal?.aborted) return Promise.reject(signal.reason);

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const pending = waiters.get(key) ?? new Set<PositionWaiter>();
		function abort(): void {
			pending.delete(waiter);
			if (pending.size === 0) waiters.delete(key);
			reject(signal?.reason);
		}
		function removeAbortListener(): void {
			signal?.removeEventListener("abort", abort);
		}
		const waiter: PositionWaiter = { nextOffset, resolve, removeAbortListener };
		pending.add(waiter);
		waiters.set(key, pending);
		signal?.addEventListener("abort", abort, { once: true });
		return promise;
	}

	return { advance, read, observeHighWatermark, readProgress, waitUntil };
}

function positionKeyOf({ topic, partition }: PartitionPosition): string {
	return JSON.stringify([topic, partition]);
}

function validatePosition({
	topic,
	partition,
	nextOffset,
}: ProgressPosition): void {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0)
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	if (nextOffset < 0n)
		throw new RangeError(`Invalid Kafka next offset: ${nextOffset}`);
}
