/**
 * Contract: check (with and without a lock) and balances.finalize treat a
 * feature its credit system prices at 0 credits as free. A check needs no
 * credits and is allowed on an empty balance; a lock holds the units without
 * moving the balance; confirming (at any override) or releasing it moves
 * none either. A plan item's feature_override decides the price both ways.
 *
 * Drives the real `runCheckV2` → Lua deduction → lock receipt →
 * `fetchAndClaimLockReceiptV2` → `runFinalizeLockV2` path against a local
 * Redis. Only the subject loader (no Postgres here), webhooks, auto top-up and
 * the event/sync batchers (which flush to Postgres) are stubbed. Writes gate on
 * the misc cache, so a bare local run needs MISC_CACHE_DRAGONFLY_PUBLIC_URL
 * pointed at that Redis too.
 */

import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import type {
	FeatureConfigOverride,
	FullCustomerEntitlement,
	FullSubject,
} from "@autumn/shared";
import {
	cachedBalance,
	createZeroCreditCostRedis,
	creditRow,
	customerId,
	messagesFeature,
	messagesOverride,
	setupZeroCreditCostSubject,
} from "@tests/integration/balances/track/zero-credit-cost/zeroCreditCostFixtures.js";
import { mockModuleWithRestore } from "@tests/unit/utils/mockModuleWithRestore.js";
import { getMiscRedis } from "@/external/redis/miscCache/getMiscRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";

let subject: FullSubject;
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/index.js",
	() => ({
		getOrSetCachedPartialFullSubject: async () => structuredClone(subject),
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({ getOrSetCachedFullSubject: async () => structuredClone(subject) }),
);
await mockModuleWithRestore(
	"@/internal/balances/trackWebhooks/fireTrackWebhooks.js",
	() => ({ fireTrackWebhooks: () => {} }),
);
await mockModuleWithRestore(
	"@/internal/balances/autoTopUp/triggerAutoTopUp.js",
	() => ({ triggerAutoTopUp: async () => {} }),
);

const { runCheckV2 } = await import("@/internal/balances/check/runCheckV2.js");
const { parseCheckParamsForLock } = await import(
	"@/internal/balances/utils/lock/parseCheckParamsForLock.js"
);
const { fetchAndClaimLockReceiptV2 } = await import(
	"@/internal/balances/utils/lockV2/fetchAndClaimLockReceiptV2.js"
);
const { runFinalizeLockV2 } = await import(
	"@/internal/balances/finalizeLock/runFinalizeLockV2.js"
);

const redis = createZeroCreditCostRedis({
	region: "test:zero-credit-cost-check-lock",
});
const addEvent = spyOn(globalEventBatchingManager, "addEvent");
const addSyncItem = spyOn(globalSyncBatchingManagerV3, "addSyncItem");

beforeAll(async () => {
	// Writes are skipped until the misc cache reports ready, as on a booted server.
	await getMiscRedis().ping();
});

beforeEach(() => {
	addEvent.mockReset().mockImplementation(() => {});
	addSyncItem.mockReset().mockImplementation(() => {});
});

const setup = async ({
	balance,
	creditAmount = 0,
	featureOverride,
}: {
	balance: number;
	creditAmount?: number;
	featureOverride?: FeatureConfigOverride;
}) => {
	const credits = creditRow({ balance, creditAmount, featureOverride });
	const { ctx, fullSubject } = await setupZeroCreditCostSubject({
		redis,
		rows: [credits],
	});
	subject = fullSubject;
	return { ctx, credits };
};

const check = async ({
	ctx,
	requiredBalance = 1,
	lockId,
}: {
	ctx: AutumnContext;
	requiredBalance?: number;
	lockId?: string;
}) => {
	const body = parseCheckParamsForLock({
		params: {
			customer_id: customerId,
			feature_id: messagesFeature.id,
			required_balance: requiredBalance,
			...(lockId && { lock: { enabled: true as const, lock_id: lockId } }),
		},
	});
	// Each check is its own request: track idempotency is keyed on the request id.
	ctx.id = crypto.randomUUID();
	const { response } = await runCheckV2({ ctx, body, requiredBalance });
	return response;
};

const finalize = async ({
	ctx,
	lockId,
	action,
	overrideValue,
}: {
	ctx: AutumnContext;
	lockId: string;
	action: "confirm" | "release";
	overrideValue?: number;
}) => {
	ctx.id = crypto.randomUUID();
	const claim = await fetchAndClaimLockReceiptV2({
		ctx,
		lockId,
		redisInstance: redis,
	});
	if (!claim.found) throw new Error(`lock receipt ${lockId} not found`);
	return runFinalizeLockV2({
		ctx,
		params: {
			lock_id: lockId,
			action,
			...(overrideValue !== undefined && { override_value: overrideValue }),
		},
		receipt: claim.receipt,
		lockReceiptKey: claim.lockReceiptKey,
		claimed: claim.claimed,
		lockRedisInstance: claim.redisInstance,
	});
};

/** A fresh lock id per test run, so receipts and claim markers never collide. */
const lockIdFor = (name: string) =>
	`zero-credit-${name}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

const creditsBalance = ({
	ctx,
	credits,
}: {
	ctx: AutumnContext;
	credits: FullCustomerEntitlement;
}) => cachedBalance({ redis, ctx, row: credits });

const eventValues = () =>
	addEvent.mock.calls.map(([event]) => (event as { value?: number }).value);

describe("zero credit cost: check, lock and finalize", () => {
	test("check needs no credits and is allowed on an empty balance", async () => {
		const { ctx, credits } = await setup({ balance: 0 });

		const response = await check({ ctx, requiredBalance: 4 });

		expect(response).toMatchObject({ allowed: true, required_balance: 0 });
		expect(await creditsBalance({ ctx, credits })).toBe(0);
	});

	test("a lock holds the units for free; confirming above the lock moves no credits", async () => {
		const { ctx, credits } = await setup({ balance: 600 });
		const lockId = lockIdFor("confirm");

		const locked = await check({ ctx, lockId });
		expect(locked).toMatchObject({ allowed: true, required_balance: 0 });
		expect(locked.balance).toMatchObject({ remaining: 600 });
		expect(await creditsBalance({ ctx, credits })).toBe(600);

		await finalize({ ctx, lockId, action: "confirm", overrideValue: 3 });
		expect(await creditsBalance({ ctx, credits })).toBe(600);
		// The lock records 1 unit; the confirm records only the 2 on top of it.
		expect(eventValues()).toEqual([1, 2]);
	});

	test("releasing a lock on a free feature moves no credits", async () => {
		const { ctx, credits } = await setup({ balance: 600 });
		const lockId = lockIdFor("release");

		await check({ ctx, lockId, requiredBalance: 2 });
		await finalize({ ctx, lockId, action: "release" });

		expect(await creditsBalance({ ctx, credits })).toBe(600);
	});

	test("a lock on an empty credit balance is still allowed and confirmable", async () => {
		const { ctx, credits } = await setup({ balance: 0 });
		const lockId = lockIdFor("empty");

		expect(await check({ ctx, lockId })).toMatchObject({ allowed: true });
		await finalize({ ctx, lockId, action: "confirm", overrideValue: 5 });

		expect(await creditsBalance({ ctx, credits })).toBe(0);
	});

	test("a priced feature still holds and settles its rate (control)", async () => {
		const { ctx, credits } = await setup({ balance: 300, creditAmount: 5 });
		const lockId = lockIdFor("priced");

		expect(await check({ ctx, lockId })).toMatchObject({
			allowed: true,
			required_balance: 5,
		});
		expect(await creditsBalance({ ctx, credits })).toBe(295);

		await finalize({ ctx, lockId, action: "confirm", overrideValue: 3 });
		expect(await creditsBalance({ ctx, credits })).toBe(285);
	});
});

describe("zero credit cost through a plan item feature_override: check, lock and finalize", () => {
	test("an override pricing a catalog-priced feature at 0 makes check and lock free", async () => {
		const { ctx, credits } = await setup({
			balance: 0,
			creditAmount: 5,
			featureOverride: messagesOverride({ creditAmount: 0 }),
		});
		const lockId = lockIdFor("override-free");

		expect(await check({ ctx, requiredBalance: 3 })).toMatchObject({
			allowed: true,
			required_balance: 0,
		});
		expect(await check({ ctx, lockId })).toMatchObject({ allowed: true });
		await finalize({ ctx, lockId, action: "confirm", overrideValue: 4 });

		expect(await creditsBalance({ ctx, credits })).toBe(0);
	});

	test("an override pricing a catalog-free feature holds and settles the override's rate", async () => {
		const { ctx, credits } = await setup({
			balance: 300,
			creditAmount: 0,
			featureOverride: messagesOverride({ creditAmount: 5 }),
		});
		const confirmLockId = lockIdFor("override-priced-confirm");
		const releaseLockId = lockIdFor("override-priced-release");

		expect(await check({ ctx, lockId: confirmLockId })).toMatchObject({
			allowed: true,
			required_balance: 5,
		});
		expect(await creditsBalance({ ctx, credits })).toBe(295);
		await finalize({
			ctx,
			lockId: confirmLockId,
			action: "confirm",
			overrideValue: 3,
		});
		expect(await creditsBalance({ ctx, credits })).toBe(285);

		await check({ ctx, lockId: releaseLockId, requiredBalance: 2 });
		expect(await creditsBalance({ ctx, credits })).toBe(275);
		await finalize({ ctx, lockId: releaseLockId, action: "release" });
		expect(await creditsBalance({ ctx, credits })).toBe(285);
	});
});

afterAll(async () => {
	addEvent.mockRestore();
	addSyncItem.mockRestore();
	await redis.quit();
});
