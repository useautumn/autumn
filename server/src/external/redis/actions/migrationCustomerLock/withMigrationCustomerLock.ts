import { randomUUID } from "node:crypto";
import { ErrCode, RecaseError } from "@autumn/shared";
import {
	getMiscRedis,
	hasMiscRedisConfig,
} from "@/external/redis/initRedis.js";
import { clearLock } from "@/external/redis/redisUtils.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { timeout } from "@/utils/genUtils.js";

const LOCK_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;
const RETRY_MIN_MS = 75;
const RETRY_JITTER_MS = 50;

const buildMigrationCustomerLockKey = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => `lock:migration-customer:${ctx.org.id}:${ctx.env}:${customerId}`;

export const withMigrationCustomerLock = async <T>({
	ctx,
	customerId,
	maxWaitMs = DEFAULT_MAX_WAIT_MS,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	maxWaitMs?: number;
	run: () => Promise<T>;
}): Promise<T> => {
	if (!hasMiscRedisConfig) return run();

	const lockKey = buildMigrationCustomerLockKey({ ctx, customerId });
	const ownerToken = randomUUID();
	const waitDeadline = Date.now() + maxWaitMs;

	while (true) {
		let result: "OK" | null;
		try {
			const miscRedis = getMiscRedis();
			result = await runRedisOp({
				source: "migration-customer-lock:acquire",
				redisInstance: miscRedis,
				operation: () =>
					miscRedis.set(lockKey, ownerToken, "PX", LOCK_TTL_MS, "NX"),
			});
		} catch (error) {
			await clearLock({ lockKey, token: ownerToken });
			throw error;
		}

		if (result === "OK") break;
		if (Date.now() >= waitDeadline) {
			throw new RecaseError({
				message: "Timed out waiting for another customer migration",
				code: ErrCode.LockAlreadyExists,
				statusCode: 423,
			});
		}

		await timeout(RETRY_MIN_MS + Math.floor(Math.random() * RETRY_JITTER_MS));
	}

	try {
		return await run();
	} finally {
		await clearLock({ lockKey, token: ownerToken });
	}
};
