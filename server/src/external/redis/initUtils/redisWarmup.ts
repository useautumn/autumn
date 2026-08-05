import type { Redis } from "ioredis";
import { getMiscRedis } from "../miscCache/getMiscRedis.js";
import { getMiscBackupRedis } from "../miscCache/miscRedisInstances.js";

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
			// A standby-routed instance reports ready when either connection is up,
			// so one socket erroring is not a readiness failure.
			if (instance.status === "ready") {
				resolve();
				return;
			}
			reject(err);
		});
	});
};

/** Pre-warm the main + fallback + V2 Redis connections. Call on startup before processing requests. */
export const warmupRegionalRedis = async (): Promise<void> => {
	const warmupPromises: Promise<void>[] = [
		waitForRedisReady(getMiscRedis(), "misc").catch((error) => {
			console.error("[Redis] misc: warmup failed -", error);
		}),
	];

	const backup = getMiscBackupRedis();
	if (backup) {
		warmupPromises.push(
			waitForRedisReady(backup, "backup").catch((error) => {
				console.error("[Redis] backup: warmup failed -", error);
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
