import { randomUUID } from "node:crypto";
import { ErrCode, RecaseError } from "@autumn/shared";
import { hasRedisConfig, redis } from "@/external/redis/initRedis.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { timeout } from "@/utils/genUtils.js";

const LOCK_TTL_MS = 15 * 60 * 1000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const RETRY_MIN_MS = 75;
const RETRY_JITTER_MS = 50;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`;

const buildMigrationCustomerLockKey = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => `lock:migration-customer:${ctx.org.id}:${ctx.env}:${customerId}`;

const releaseMigrationCustomerLock = async ({
	lockKey,
	ownerToken,
}: {
	lockKey: string;
	ownerToken: string;
}) =>
	runRedisOp({
		source: "migration-customer-lock:release",
		operation: () => redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, ownerToken),
	});

export const withMigrationCustomerLock = async <T>({
	ctx,
	customerId,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	run: () => Promise<T>;
}): Promise<T> => {
	if (!hasRedisConfig) return run();

	const lockKey = buildMigrationCustomerLockKey({ ctx, customerId });
	const ownerToken = randomUUID();
	const waitDeadline = Date.now() + MAX_WAIT_MS;

	while (true) {
		let result: "OK" | null;
		try {
			result = await runRedisOp({
				source: "migration-customer-lock:acquire",
				operation: () =>
					redis.set(lockKey, ownerToken, "PX", LOCK_TTL_MS, "NX"),
			});
		} catch (error) {
			await releaseMigrationCustomerLock({ lockKey, ownerToken }).catch(
				() => undefined,
			);
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
		await releaseMigrationCustomerLock({ lockKey, ownerToken }).catch(
			(error) => {
				ctx.logger.warn("migration-customer-lock: release failed", {
					data: {
						customerId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			},
		);
	}
};
