import type { Redis } from "ioredis";
import {
	getFallbackRedis,
	getRegionalRedisForInstance,
} from "./redisClientRegistry.js";
import { getConfiguredRegions } from "./redisConfig.js";

/** Wait for a Redis instance to be ready */
export const waitForRedisReady = (
	instance: Redis,
	region: string,
	timeoutMs = 10000,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (instance.status === "ready") {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			reject(new Error(`Redis connection timeout for region ${region}`));
		}, timeoutMs);

		instance.once("ready", () => {
			clearTimeout(timeout);
			console.log(`[Redis] ${region}: connected`);
			resolve();
		});

		instance.once("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
};

/** Pre-warm all regional Redis connections. Call on startup before processing requests. */
export const warmupRegionalRedis = async (): Promise<void> => {
	const regions = getConfiguredRegions();
	console.log(
		`[Redis] Warming up connections for ${regions.length} regions...`,
	);

	const warmupPromises = regions.map(async (region) => {
		try {
			const instance = getRegionalRedisForInstance({
				region,
				instance: "primary",
			});
			await waitForRedisReady(instance, region);
		} catch (error) {
			console.error(`[Redis] ${region}: warmup failed -`, error);
			// Don't throw - allow startup to continue even if one region fails
		}
	});

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
