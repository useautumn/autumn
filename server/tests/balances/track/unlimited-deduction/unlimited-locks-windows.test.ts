import { expect, test } from "bun:test";
import { balanceLocks } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { setCustomerUsageLimit } from "@tests/integration/balances/utils/usage-limit-utils/customerUsageLimitUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getRedisV2OrgCleanupCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

const LEGACY_SYNC_DEDUP_BUCKET_MS = 2_500;

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

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
	if (!isBalanceWorkerRoute()) await timeout(LEGACY_SYNC_DEDUP_BUCKET_MS);
};

interface LockReceipt {
	lock_id: string | null;
	status: string;
	customer_id: string;
	feature_id: string;
	overrideLockValue: number | null;
	items: MutationLogItem[];
}

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

const workerLockDeltasSchema = z.array(
	z.object({ table: z.string(), id: z.string(), balanceDelta: z.number() }),
);

type LockBalanceMove = {
	balanceDelta: number;
	customerEntitlementId: string | null;
};

const fetchLockBalanceMoves = async ({
	ctx,
	lockId,
}: {
	ctx: TestContext;
	lockId: string;
}): Promise<{ featureId: string; moves: LockBalanceMove[] } | null> => {
	const [lock] = await ctx.db
		.select({
			feature_id: balanceLocks.feature_id,
			deltas: balanceLocks.deltas,
		})
		.from(balanceLocks)
		.where(
			and(
				eq(balanceLocks.org_id, ctx.org.id),
				eq(balanceLocks.env, ctx.env),
				eq(balanceLocks.lock_id, lockId),
			),
		);
	if (lock) {
		return {
			featureId: lock.feature_id,
			moves: workerLockDeltasSchema.parse(lock.deltas).map((delta) => ({
				balanceDelta: delta.balanceDelta,
				customerEntitlementId:
					delta.table === "customerEntitlements" ? delta.id : null,
			})),
		};
	}

	const receipt = await fetchRawLockReceipt({ ctx, lockId });
	if (!receipt) return null;
	return {
		featureId: receipt.feature_id,
		moves: receipt.items.map((item) => ({
			balanceDelta: item.balance_delta,
			customerEntitlementId:
				item.target_type === "customer_entitlement"
					? item.customer_entitlement_id
					: null,
		})),
	};
};

const makeUnlimitedProduct = () =>
	products.base({ id: "unl", items: [items.unlimitedMessages()] });

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

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		const trackResponse = await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		expect(trackResponse.customer_id).toBe(customerId);

		const postCapCheck = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(postCapCheck.allowed).toBe(true);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

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

		await expectRawDbBalance({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			balance: -13,
		});
	},
);

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

		const lock = await pollUntilAsserted({
			fetch: () => fetchLockBalanceMoves({ ctx, lockId }),
			assert: (value) => expect(value).not.toBeNull(),
			timeoutMs: 20_000,
		});
		expect(lock?.featureId).toBe(TestFeature.Messages);

		const moves = lock?.moves ?? [];
		expect(moves.length).toBeGreaterThan(0);
		const totalBalanceDelta = moves.reduce(
			(sum, move) => sum + move.balanceDelta,
			0,
		);
		expect(totalBalanceDelta).toBe(-5);
		expect(moves.every((move) => move.customerEntitlementId !== null)).toBe(
			true,
		);

		await autumnV2_3.balances.finalize({ lock_id: lockId, action: "release" });
	},
);
