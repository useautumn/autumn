import type { Redis } from "ioredis";
import { resolveCustomerRedisRouting } from "@/external/redis/customerRedisRouting.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runRedisOp, tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";

/**
 * Lock receipts live in the Redis V2 cache next to the subject they unwind, and that cache evicts
 * under memory pressure. A receipt is written once and not read until finalize, so it is among the
 * first keys evicted, which leaves the debit in place and every finalize answering "Lock not found".
 * A copy in the misc Redis, which holds little and does not come under that pressure, lets finalize
 * put the receipt back. Writing the copy is best-effort, so the misc Redis being down never fails a
 * check. Deleting it is not: finalize removes the copy before it settles, so a settled lock cannot
 * be restored and settled twice.
 */

const lockIdToReceiptKey = ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}): string =>
	buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: Bun.hash(lockId).toString(),
	});

/** A check's debit has already landed by the time it backs up the receipt; a slow backup store
 *  must not turn that into a timed-out request. */
const LOCK_RECEIPT_BACKUP_TIMEOUT_MS = 200;

/** Copies the receipt as it stands, expiry included, so the backup never outlives it. */
export const copyLockReceiptToBackup = async ({
	ctx,
	lockReceiptKey,
	redisInstance,
}: {
	ctx: AutumnContext;
	lockReceiptKey: string;
	redisInstance: Redis;
}): Promise<void> => {
	const current = await tryRedisOp({
		operation: (redis) =>
			redis.pipeline().get(lockReceiptKey).pttl(lockReceiptKey).exec(),
		source: "copyLockReceiptToBackup:read",
		redisInstance,
		timeoutMs: LOCK_RECEIPT_BACKUP_TIMEOUT_MS,
	});
	const raw = current?.[0]?.[1] as string | null | undefined;
	const remainingMs = current?.[1]?.[1] as number | null | undefined;
	if (!raw || !remainingMs || remainingMs <= 0) return;

	const result = await tryRedisOp({
		operation: (redis) => redis.set(lockReceiptKey, raw, "PX", remainingMs),
		source: "copyLockReceiptToBackup:write",
		redisInstance: getMiscRedis(),
		timeoutMs: LOCK_RECEIPT_BACKUP_TIMEOUT_MS,
	});
	if (result !== "OK") {
		ctx.logger.warn(
			`[lockReceiptBackup] failed to back up lock receipt ${lockReceiptKey}`,
		);
	}
};

/** Throws when the copy may still exist, so a caller about to settle the lock can stop first. */
export const deleteLockReceiptBackupOrThrow = async ({
	lockReceiptKey,
}: {
	lockReceiptKey: string;
}): Promise<void> => {
	await runRedisOp({
		operation: (redis) => redis.del(lockReceiptKey),
		source: "deleteLockReceiptBackup",
		redisInstance: getMiscRedis(),
	});
};

/**
 * Puts an evicted receipt back into the customer's Redis from its backup. Returns false when there
 * is no backup, or when the backup disappeared while restoring (a concurrent finalize settled the
 * lock), in which case the restored copy is removed again so the lock cannot be settled twice.
 */
export const restoreLockReceiptFromBackup = async ({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}): Promise<boolean> => {
	const lockReceiptKey = lockIdToReceiptKey({ ctx, lockId });
	const miscRedis = getMiscRedis();

	// Required, not best-effort: an outage here must not read as "Lock not found".
	const backup = await runRedisOp({
		operation: (redis) =>
			redis.pipeline().get(lockReceiptKey).pttl(lockReceiptKey).exec(),
		source: "restoreLockReceiptFromBackup:read",
		redisInstance: miscRedis,
	});
	const backupError = backup?.find(([error]) => error)?.[0];
	if (backupError) {
		throw new RedisUnavailableError({
			source: "restoreLockReceiptFromBackup:read",
			reason: "other",
			cause: backupError,
		});
	}
	const raw = backup?.[0]?.[1] as string | null | undefined;
	const remainingMs = backup?.[1]?.[1] as number | null | undefined;
	if (!raw || !remainingMs || remainingMs <= 0) return false;

	const receipt = JSON.parse(raw) as LockReceipt;
	const { redis: customerRedis } = resolveCustomerRedisRouting({
		org: ctx.org,
		customerId: receipt.customer_id,
	});

	const restored = await customerRedis.set(
		lockReceiptKey,
		raw,
		"PX",
		remainingMs,
		"NX",
	);
	// Already back (a concurrent restore): the caller's claim decides who settles it.
	if (restored !== "OK") return true;

	// A finalize deletes the backup before it settles, so a backup that is gone now means the lock
	// was settled while this restore ran, and the copy just written must not outlive it.
	const stillBackedUp = await miscRedis.exists(lockReceiptKey);
	if (stillBackedUp !== 1) {
		await customerRedis.del(lockReceiptKey);
		return false;
	}

	ctx.logger.warn(
		`[lockReceiptBackup] restored evicted lock receipt ${lockId} for customer ${receipt.customer_id}`,
	);
	return true;
};
