import { randomUUID } from "node:crypto";
import { hasMiscRedisConfig } from "@/external/redis/initRedis.js";
import { acquireLockWithWait } from "@/external/redis/utils/lockUtils/acquireLockWithWait.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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

	// Migrations must never run concurrently for a customer — fail closed when
	// Redis is unavailable instead of proceeding unlocked.
	await acquireLockWithWait({
		lockKey,
		ttlMs: LOCK_TTL_MS,
		token: ownerToken,
		maxWaitMs,
		retryMs: RETRY_MIN_MS,
		retryJitterMs: RETRY_JITTER_MS,
		errorMessage: "Timed out waiting for another customer migration",
		failOpen: false,
	});

	try {
		return await run();
	} finally {
		await clearLock({ lockKey, token: ownerToken });
	}
};
