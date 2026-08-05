import type { Redis } from "ioredis";
import { getFallbackRedis, getMiscRedis } from "./redisClientRegistry.js";
import { hasMiscRedisConfig } from "./redisConfig.js";

/** Wait for a Redis instance to be ready */
export const waitForRedisReady = (
	instance: Redis,
	label: string,
	timeoutMs = 10000,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (instance.status === "ready") {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			reject(new Error(`Redis connection timeout for ${label}`));
		}, timeoutMs);

		instance.once("ready", () => {
			clearTimeout(timeout);
			console.log(`[Redis] ${label}: connected`);
			resolve();
		});

		instance.once("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
};

/** Pre-warm the main + fallback + V2 Redis connections. Call on startup before processing requests. */
export const warmupRegionalRedis = async (): Promise<void> => {
	const warmupPromises: Promise<void>[] = [];

	if (hasMiscRedisConfig) {
		warmupPromises.push(
			waitForRedisReady(getMiscRedis(), "misc").catch((error) => {
				console.error("[Redis] misc: warmup failed -", error);
			}),
		);
	}

	const fallback = getFallbackRedis();
	if (fallback) {
		warmupPromises.push(
			waitForRedisReady(fallback, "fallback").catch((error) => {
				console.error("[Redis] fallback: warmup failed -", error);
			}),
		);
	}

	await Promise.all(warmupPromises);

	try {
		const { warmupRedisV2 } = await import("../initRedisV2.js");
		await warmupRedisV2();
	} catch (error) {
		console.error("[Redis] v2: warmup failed -", error);
	}

	console.log("[Redis] Warmup complete");
};
