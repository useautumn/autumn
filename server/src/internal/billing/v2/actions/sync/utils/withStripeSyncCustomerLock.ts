import { randomUUID } from "node:crypto";
import { ErrCode, ms, RecaseError } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { timeout } from "@/utils/genUtils";

const LOCK_TTL_MS = ms.seconds(30);
const MAX_RETRY_MS = ms.seconds(1);

const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`;

/** Serializes initial imports with subscription-created webhooks and waits for the winner. */
export const withStripeSyncCustomerLock = async <T>({
	ctx,
	customerId,
	leaseMs = LOCK_TTL_MS,
	maxWaitMs = LOCK_TTL_MS,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	leaseMs?: number;
	maxWaitMs?: number;
	run: () => Promise<T>;
}) => {
	if (redis.status !== "ready") return run();

	const lockKey = `lock:stripe-sync:${ctx.org.id}:${ctx.env}:${customerId}`;
	const ownerToken = randomUUID();
	const deadline = Date.now() + maxWaitMs;
	const renewMs = Math.max(Math.floor(leaseMs / 3), 1);
	let retryMs = 50;

	while (true) {
		const acquired = await tryRedisOp({
			source: "stripe-sync-customer-lock:acquire",
			operation: () => redis.set(lockKey, ownerToken, "PX", leaseMs, "NX"),
		});
		if (acquired === "OK") break;
		if (acquired === undefined) return run();
		if (Date.now() >= deadline) {
			throw new RecaseError({
				message: "Timed out waiting for another Stripe customer sync",
				code: ErrCode.LockAlreadyExists,
				statusCode: 423,
			});
		}
		await timeout(retryMs + Math.floor(Math.random() * retryMs));
		retryMs = Math.min(retryMs * 2, MAX_RETRY_MS, leaseMs);
	}

	let stopped = false;
	let renewTimer: ReturnType<typeof setTimeout>;
	const renew = async () => {
		const renewed = await tryRedisOp({
			source: "stripe-sync-customer-lock:renew",
			operation: () =>
				redis.eval(RENEW_LOCK_SCRIPT, 1, lockKey, ownerToken, leaseMs),
		});
		if (renewed === 0) {
			ctx.logger.warn("stripe-sync-customer-lock: ownership lost", {
				data: { customerId },
			});
			return;
		}
		if (!stopped) renewTimer = setTimeout(renew, renewMs);
	};
	renewTimer = setTimeout(renew, renewMs);

	try {
		return await run();
	} finally {
		stopped = true;
		clearTimeout(renewTimer);
		await tryRedisOp({
			source: "stripe-sync-customer-lock:release",
			operation: () => redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, ownerToken),
		});
	}
};
