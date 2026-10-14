import { createConsoleLogger } from "@autumn/logging";
import type { Redis } from "ioredis";
import type { CacheLogger } from "./types/redisClient.js";

const loggers = new WeakMap<Redis, CacheLogger>();
let fallback: CacheLogger | undefined;

export const rememberClientLogger = ({
	redis,
	logger,
}: {
	redis: Redis;
	logger: CacheLogger;
}): void => {
	loggers.set(redis, logger);
};

export const clientLoggerOf = ({ redis }: { redis: Redis }): CacheLogger => {
	fallback ??= createConsoleLogger({ level: "info" });
	return loggers.get(redis) ?? fallback;
};
