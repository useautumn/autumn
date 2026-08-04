import type { Redis } from "ioredis";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { getQueueConcurrencyPolicy } from "@/queue/concurrency/getQueueConcurrencyPolicy.js";
import { generateId } from "@/utils/genUtils.js";

type QueueConcurrencyPermit = {
	release: () => Promise<void>;
};

export type LeasedQueueItem<T> = {
	item: T;
	release: () => Promise<void>;
};

export type QueueCapacityLease = {
	capacity: number;
	isLimited: boolean;
	assign: <T>(items: T[]) => Promise<LeasedQueueItem<T>[]>;
	release: () => Promise<void>;
};

const releaseImmediately = () => Promise.resolve();

const releasePermits = async (permits: QueueConcurrencyPermit[]) => {
	await Promise.allSettled(permits.map((permit) => permit.release()));
};

const createPermit = ({
	redis,
	redisKey,
	token,
}: {
	redis: Redis;
	redisKey: string;
	token: string;
}): QueueConcurrencyPermit => {
	let released = false;

	return {
		release: async () => {
			if (released) return;
			released = true;

			try {
				await runRedisOp({
					source: "queue-concurrency:release",
					redisInstance: redis,
					operation: () => redis.releaseQueuePermit(redisKey, token),
				});
			} catch {
				// The permit lease expires automatically if Redis cannot release it.
			}
		},
	};
};

const createUnlimitedLease = ({
	requested,
}: {
	requested: number;
}): QueueCapacityLease => ({
	capacity: requested,
	isLimited: false,
	assign: async <T>(items: T[]) =>
		items.map((item) => ({
			item,
			release: releaseImmediately,
		})),
	release: releaseImmediately,
});

const createLimitedLease = ({
	permits,
}: {
	permits: QueueConcurrencyPermit[];
}): QueueCapacityLease => ({
	capacity: permits.length,
	isLimited: true,
	assign: async <T>(items: T[]) => {
		await releasePermits(permits.slice(items.length));

		return items.map((item, index) => ({
			item,
			release: permits[index].release,
		}));
	},
	release: () => releasePermits(permits),
});

export const reserveQueueCapacity = async ({
	queueId,
	requested,
}: {
	queueId: string;
	requested: number;
}): Promise<QueueCapacityLease | null> => {
	const requestedCount = Math.max(0, Math.floor(requested));
	if (requestedCount === 0) return null;

	const policy = getQueueConcurrencyPolicy({ queueId });
	if (!policy) return createUnlimitedLease({ requested: requestedCount });

	const acquiredAt = Date.now();
	const tokens = Array.from({ length: requestedCount }, () =>
		generateId("queue_permit"),
	);

	try {
		const redis = getMiscRedis();
		const result = await runRedisOp({
			source: "queue-concurrency:acquire",
			redisInstance: redis,
			operation: () =>
				redis.acquireQueuePermits(
					policy.redisKey,
					acquiredAt,
					acquiredAt + policy.leaseMs,
					policy.maxConcurrentMessages,
					requestedCount,
					...tokens,
				),
		});
		const acquiredResult = Number(result);
		if (!Number.isFinite(acquiredResult)) {
			return createUnlimitedLease({ requested: requestedCount });
		}

		const acquired = Math.max(0, Math.min(requestedCount, acquiredResult));
		if (acquired === 0) return null;

		const permits = tokens
			.slice(0, acquired)
			.map((token) =>
				createPermit({ redis, redisKey: policy.redisKey, token }),
			);
		return createLimitedLease({ permits });
	} catch {
		// Fail open to normal SQS capacity so Redis cannot stop queue processing.
		return createUnlimitedLease({ requested: requestedCount });
	}
};
