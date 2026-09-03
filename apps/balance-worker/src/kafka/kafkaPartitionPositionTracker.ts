type KafkaPartitionPosition = {
	topic: string;
	partition: number;
};

type PositionWaiter = {
	nextOffset: bigint;
	resolve: () => void;
	removeAbortListener: () => void;
};

const positionKeyOf = ({ topic, partition }: KafkaPartitionPosition): string =>
	JSON.stringify([topic, partition]);

const validatePosition = ({
	topic,
	partition,
	nextOffset,
}: KafkaPartitionPosition & { nextOffset: bigint }): void => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	if (nextOffset < 0n) {
		throw new RangeError(`Invalid Kafka next offset: ${nextOffset}`);
	}
};

export type KafkaPartitionPositionTrackerPort = {
	advance(position: KafkaPartitionPosition & { nextOffset: bigint }): void;
	read(position: KafkaPartitionPosition): bigint | null;
	waitUntil(
		position: KafkaPartitionPosition & {
			nextOffset: bigint;
			signal?: AbortSignal;
		},
	): Promise<void>;
};

export class KafkaPartitionPositionTracker
	implements KafkaPartitionPositionTrackerPort
{
	private readonly nextOffsets = new Map<string, bigint>();
	private readonly waiters = new Map<string, Set<PositionWaiter>>();

	advance({
		topic,
		partition,
		nextOffset,
	}: KafkaPartitionPosition & { nextOffset: bigint }): void {
		validatePosition({ topic, partition, nextOffset });
		const key = positionKeyOf({ topic, partition });
		const currentNextOffset = this.nextOffsets.get(key);
		if (currentNextOffset !== undefined && currentNextOffset >= nextOffset)
			return;

		this.nextOffsets.set(key, nextOffset);
		const positionWaiters = this.waiters.get(key);
		if (!positionWaiters) return;

		for (const waiter of positionWaiters) {
			if (waiter.nextOffset > nextOffset) continue;
			positionWaiters.delete(waiter);
			waiter.removeAbortListener();
			waiter.resolve();
		}
		if (positionWaiters.size === 0) this.waiters.delete(key);
	}

	read({ topic, partition }: KafkaPartitionPosition): bigint | null {
		validatePosition({ topic, partition, nextOffset: 0n });
		return this.nextOffsets.get(positionKeyOf({ topic, partition })) ?? null;
	}

	waitUntil({
		topic,
		partition,
		nextOffset,
		signal,
	}: KafkaPartitionPosition & {
		nextOffset: bigint;
		signal?: AbortSignal;
	}): Promise<void> {
		validatePosition({ topic, partition, nextOffset });
		const key = positionKeyOf({ topic, partition });
		const currentNextOffset = this.nextOffsets.get(key);
		if (currentNextOffset !== undefined && currentNextOffset >= nextOffset) {
			return Promise.resolve();
		}
		if (signal?.aborted) return Promise.reject(signal.reason);

		return new Promise<void>((resolve, reject) => {
			const positionWaiters =
				this.waiters.get(key) ?? new Set<PositionWaiter>();
			const removeWaiter = (): void => {
				positionWaiters.delete(waiter);
				if (positionWaiters.size === 0) this.waiters.delete(key);
			};
			const abort = (): void => {
				removeWaiter();
				reject(signal?.reason);
			};
			const waiter: PositionWaiter = {
				nextOffset,
				resolve,
				removeAbortListener: () => signal?.removeEventListener("abort", abort),
			};
			positionWaiters.add(waiter);
			this.waiters.set(key, positionWaiters);
			signal?.addEventListener("abort", abort, { once: true });
		});
	}
}
