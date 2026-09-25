import { expect } from "bun:test";
import { balanceLocks, ms } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";

const TOLERANCE_MS = ms.seconds(5);
const DEFAULT_LOCK_LIFETIME_MS = ms.hours(24);
/** The legacy receipt outlives a caller's expiry by an hour, so the expiry job still finds it. */
const LEGACY_RECEIPT_GRACE_MS = ms.hours(1);

const expectWithin = ({
	actual,
	expected,
}: {
	actual: number;
	expected: number;
}) => {
	expect(actual).toBeGreaterThanOrEqual(expected - TOLERANCE_MS);
	expect(actual).toBeLessThanOrEqual(expected + TOLERANCE_MS);
};

/**
 * A lock with the caller's `expiresAt` releases then; without one it is confirmed a day after `checkedAt`.
 * The balance worker keeps that on the lock's row, the legacy path as the Redis receipt's TTL.
 */
export const expectLockExpiryCorrect = async ({
	ctx,
	lockId,
	checkedAt,
	expiresAt,
}: {
	ctx: TestContext;
	lockId: string;
	checkedAt: number;
	expiresAt?: number;
}) => {
	const [lock] = await ctx.db
		.select({
			expires_at: balanceLocks.expires_at,
			expiry_action: balanceLocks.expiry_action,
		})
		.from(balanceLocks)
		.where(
			and(
				eq(balanceLocks.org_id, ctx.org.id),
				eq(balanceLocks.env, ctx.env),
				eq(balanceLocks.lock_id, lockId),
			),
		);

	// No worker row: the lock was taken on the legacy path and lives as a Redis receipt.
	if (!lock) {
		const { redisInstance, lockReceiptKey } = await fetchLockReceipt({
			ctx,
			lockId,
		});
		const receiptExpiresAt =
			(await redisInstance.expiretime(lockReceiptKey)) * 1000;
		expectWithin({
			actual: receiptExpiresAt,
			expected: expiresAt
				? expiresAt + LEGACY_RECEIPT_GRACE_MS
				: checkedAt + DEFAULT_LOCK_LIFETIME_MS,
		});
		return;
	}

	expect(lock.expiry_action).toBe(expiresAt ? "release" : "confirm");
	expectWithin({
		actual: lock.expires_at,
		expected: expiresAt ?? checkedAt + DEFAULT_LOCK_LIFETIME_MS,
	});
};
