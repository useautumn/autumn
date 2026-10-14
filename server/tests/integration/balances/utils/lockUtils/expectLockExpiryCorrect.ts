import { expect } from "bun:test";
import { balanceLocks, ms } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";

const TOLERANCE_MS = ms.seconds(5);
const DEFAULT_LOCK_LIFETIME_MS = ms.hours(24);
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
