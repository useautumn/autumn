import { getMiscRedis } from "@/external/redis/initRedis.js";

export type FixedWindowCounter = {
	incrWithExpiry: (key: string, ttlMs: number) => Promise<number>;
};

const redisCounter = (): FixedWindowCounter => ({
	incrWithExpiry: async (key, ttlMs) => {
		const results = await getMiscRedis()
			.multi()
			.incr(key)
			.pexpire(key, ttlMs)
			.exec();
		return Number(results?.[0]?.[1] ?? 0);
	},
});

/** Counts one hit on `hrl:{key}:{windowStart}` and returns the window's hits so far. */
export const incrementFixedWindow = ({
	key,
	windowMs,
	counter = redisCounter(),
	now = Date.now(),
}: {
	key: string;
	windowMs: number;
	counter?: FixedWindowCounter;
	now?: number;
}) => {
	const windowStart = Math.floor(now / windowMs) * windowMs;
	return counter.incrWithExpiry(`hrl:${key}:${windowStart}`, windowMs * 2);
};
