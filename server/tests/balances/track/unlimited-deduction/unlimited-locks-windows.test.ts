/**
 * TDD (Cover) tests for lock/finalize + usage windows on UNLIMITED features,
 * under the new "unlimited balances really deduct" contract.
 *
 * Contract:
 *   - A lock (check with lock) of value N on an unlimited feature deducts for
 *     real: raw DB customer_entitlements.balance goes to -N (drifts negative).
 *   - Finalize release fully unwinds the lock: raw balance returns to 0.
 *   - Finalize confirm with override_value < lock keeps only the confirmed
 *     usage: raw balance ends at -override_value.
 *   - Lock receipts carry REAL mutation items (not empty items +
 *     overrideLockValue), so finalize/unwind re-credits from the receipt.
 *   - Usage windows stay SKIPPED for unlimited: tracking past a configured
 *     hard usage cap never rejects, and the window counter never increments.
 *
 * Red (current): the unlimitedFeatureIds skip in executeRedisDeductionV2
 *   short-circuits before any deduction — raw balance stays 0 forever and
 *   receipts are saved with items: [] + overrideLockValue.
 * Green (after): balances move (negative) and receipts carry real items;
 *   the window skip assertions are regression guards that must stay green.
 *
 * API output stays masked (unlimited), so all balance assertions here read
 * the RAW customer_entitlements.balance via ctx.db, never the API.
 */

import { expect, test } from "bun:test";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { setCustomerUsageLimit } from "@tests/integration/balances/utils/usage-limit-utils/customerUsageLimitUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { getRedisV2OrgCleanupCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

/**
 * Polls the RAW customer_entitlements.balance in Postgres until it equals the
 * expected value. Track/lock effects settle to PG async via the sync workers,
 * so a single read would race them.
 */
const expectRawDbBalance = async ({
	ctx,
	customerId,
	featureId,
	balance,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	balance: number;
}) => {
	await pollUntilAsserted({
		fetch: async () =>
			queryRows(
				await ctx.db.execute(sql`
					SELECT balance, unlimited FROM customer_entitlements
					WHERE customer_id = ${customerId} AND feature_id = ${featureId}
					LIMIT 1
				`),
			)[0],
		assert: (row) => {
			expect(row).toBeDefined();
			expect(Number(row.balance)).toBe(balance);
		},
		timeoutMs: 20_000,
	});
};

interface LockReceipt {
	lock_id: string | null;
	status: string;
	customer_id: string;
	feature_id: string;
	overrideLockValue: number | null;
	items: MutationLogItem[];
}

/** Reads the raw V2 lock receipt (plain JSON string) from Redis. */
const fetchRawLockReceipt = async ({
	ctx,
	lockId,
}: {
	ctx: TestContext;
	lockId: string;
}): Promise<LockReceipt | null> => {
	const redisReceiptKey = buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: Bun.hash(lockId).toString(),
	});
	for (const redisInstance of getRedisV2OrgCleanupCandidates({ ctx })) {
		const payload = await redisInstance.get(redisReceiptKey);
		if (payload) return JSON.parse(payload) as LockReceipt;
	}
	return null;
};

const makeUnlimitedProduct = () =>
	products.base({ id: "unl", items: [items.unlimitedMessages()] });

// ── 1. Lock + finalize round trip: unlimited deducts, unwind re-credits ──────
test.concurrent(
	`${chalk.yellowBright("unl-locks1: lock on unlimited deducts raw balance; release/partial-confirm re-credit it")}`,
	async () => {
		const unlimitedProduct = makeUnlimitedProduct();
		const customerId = "unl-lock-rt";
		const releaseLockId = `${customerId}-a`;
		const partialLockId = `${customerId}-b`;

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedProduct] }),
			],
			actions: [s.billing.attach({ productId: unlimitedProduct.id })],
		});
		await deleteLock({ ctx, lockId: releaseLockId });
		await deleteLock({ ctx, lockId: partialLockId });

		// Lock 5: the unlimited cusEnt must really deduct in the raw DB.
		const granted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
			lock: { enabled: true, lock_id: releaseLockId },
		});
		expect(granted.allowed).toBe(true);
		await expectRawDbBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: -5,
		});

		// Full unwind: release re-credits the lock value entirely.
		await autumnV2_3.balances.finalize({
			lock_id: releaseLockId,
			action: "release",
		});
		await expectRawDbBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: 0,
		});

		// Partial finalize: lock 5, confirm at 3 → only 3 stays consumed.
		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
			lock: { enabled: true, lock_id: partialLockId },
		});
		await expectRawDbBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: -5,
		});
		await autumnV2_3.balances.finalize({
			lock_id: partialLockId,
			action: "confirm",
			override_value: 3,
		});
		await expectRawDbBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: -3,
		});
	},
);

// ── 2. Usage windows stay skipped for unlimited ──────────────────────────────
test.concurrent(
	`${chalk.yellowBright("unl-locks2: usage windows never reject nor count on unlimited, but balance still deducts")}`,
	async () => {
		const unlimitedProduct = makeUnlimitedProduct();
		const customerId = "unl-uw-skip";

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedProduct] }),
			],
			actions: [s.billing.attach({ productId: unlimitedProduct.id })],
		});

		// Arm a windowed hard cap of 5 on the unlimited feature.
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// GREEN regression guard: tracking PAST the cap must not be rejected.
		// (Proven able to fail: on a metered capped feature the post-cap check
		// below flips to allowed=false — see file history / report.)
		const trackResponse = await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		expect(trackResponse.customer_id).toBe(customerId);

		// GREEN regression guard: past the cap, checks stay allowed.
		const postCapCheck = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(postCapCheck.allowed).toBe(true);

		// A further track must also go through untouched by the window.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		// GREEN regression guard: the window counter must NOT have incremented.
		const usageWindowsJson = await ctx.redisV2.hget(
			buildSharedFullSubjectBalanceKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				featureId: TestFeature.Messages,
			}),
			"_usage_windows",
		);
		if (usageWindowsJson) {
			const usageWindows = JSON.parse(usageWindowsJson) as {
				usage: number | string;
			}[];
			for (const usageWindow of usageWindows) {
				expect(Number(usageWindow.usage)).toBe(0);
			}
		}

		// RED: the deductions themselves must land — raw balance -(10+3).
		await expectRawDbBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: -13,
		});
	},
);

// ── 3. Lock receipts carry real mutation items ───────────────────────────────
test.concurrent(
	`${chalk.yellowBright("unl-locks3: unlimited lock receipt holds real mutation items, not empty+override")}`,
	async () => {
		const unlimitedProduct = makeUnlimitedProduct();
		const customerId = "unl-lock-rcpt";
		const lockId = `${customerId}-lock`;

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedProduct] }),
			],
			actions: [s.billing.attach({ productId: unlimitedProduct.id })],
		});
		await deleteLock({ ctx, lockId });

		const granted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
			lock: { enabled: true, lock_id: lockId },
		});
		expect(granted.allowed).toBe(true);

		const receipt = await fetchRawLockReceipt({ ctx, lockId });
		expect(receipt).not.toBeNull();
		expect(receipt?.feature_id).toBe(TestFeature.Messages);

		// RED: today unlimited receipts are saved with items: [] and an
		// overrideLockValue; real deduction must record real mutation items
		// whose balance deltas sum to the locked value.
		const receiptItems = receipt?.items ?? [];
		expect(receiptItems.length).toBeGreaterThan(0);
		const totalBalanceDelta = receiptItems.reduce(
			(sum, item) => sum + item.balance_delta,
			0,
		);
		expect(totalBalanceDelta).toBe(-5);
		expect(
			receiptItems.every(
				(item) =>
					item.target_type === "customer_entitlement" &&
					item.customer_entitlement_id !== null,
			),
		).toBe(true);

		// Clean up so re-runs and finalize-path tests never trip on this lock.
		await autumnV2_3.balances.finalize({ lock_id: lockId, action: "release" });
	},
);
