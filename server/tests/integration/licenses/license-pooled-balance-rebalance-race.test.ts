import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	customerEntitlements,
	customers,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { executePooledBalanceOps } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

type RedisBatchUpdate = {
	cus_ent_id?: string;
	balance_delta?: number;
};

type RedisBalanceBatches = {
	batches?: Array<{ updates?: RedisBatchUpdate[] }>;
};

const waitForBarrier = async ({
	barrier,
	timeoutMs,
}: {
	barrier: Promise<void>;
	timeoutMs: number;
}): Promise<void> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			barrier,
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() =>
						reject(new Error("Timed out waiting for pooled cache mutation")),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
};

const waitForSyncedPoolBalances = async ({
	ctx,
	customerEntitlementIds,
	expectedBalances,
	timeoutMs = 10_000,
}: {
	ctx: AutumnContext;
	customerEntitlementIds: string[];
	expectedBalances: number[];
	timeoutMs?: number;
}) => {
	const deadline = Date.now() + timeoutMs;
	let lastBalances: number[] = [];

	while (Date.now() < deadline) {
		const poolCustomerEntitlements =
			await ctx.db.query.customerEntitlements.findMany({
				where: inArray(customerEntitlements.id, customerEntitlementIds),
			});
		lastBalances = poolCustomerEntitlements.map(
			(customerEntitlement) => customerEntitlement.balance,
		);
		if (
			expectedBalances.every((expectedBalance) =>
				lastBalances.includes(expectedBalance),
			)
		) {
			return poolCustomerEntitlements;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	throw new Error(
		`Timed out waiting for pooled balances ${expectedBalances.join(", ")}; last observed ${lastBalances.join(", ")}`,
	);
};

/** Red: track sees a partial pooled rebalance and rejects. Green: the cache cutover is atomic, so the same track succeeds. */
test(`${chalk.yellowBright("licenses pooled race: track cannot observe a partially applied source-removal rebalance")}`, async () => {
	const hourlyPlan = products.base({
		id: "pooled-rebalance-race-hourly",
		isAddOn: true,
		items: [
			{
				...items.hourlyMessages({ includedUsage: 500 }),
				pooled: true,
			},
		],
	});
	const monthlyPlan = products.base({
		id: "pooled-rebalance-race-monthly",
		isAddOn: true,
		items: [
			{
				...items.monthlyMessages({ includedUsage: 500 }),
				pooled: true,
			},
		],
	});

	const { customerId, entities, autumnV2_2, ctx } = await initScenario({
		customerId: "license-pooled-rebalance-cache-race",
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [hourlyPlan, monthlyPlan] }),
		],
		actions: [],
	});

	await Promise.all([
		autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: hourlyPlan.id,
		}),
		autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: monthlyPlan.id,
		}),
	]);
	await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[2].id,
		feature_id: TestFeature.Messages,
		value: 300,
		overage_behavior: "reject",
	});

	const internalCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!internalCustomer) throw new Error("Expected pooled race customer");

	const pools = await ctx.db.query.pooledBalances.findMany({
		where: eq(
			pooledBalances.internal_customer_id,
			internalCustomer.internal_id,
		),
	});
	expect(pools).toHaveLength(2);

	const poolCustomerEntitlements = await waitForSyncedPoolBalances({
		ctx,
		customerEntitlementIds: pools.map((pool) => pool.customer_entitlement_id),
		expectedBalances: [200, 500],
	});
	const consumedCustomerEntitlement = poolCustomerEntitlements.find(
		(customerEntitlement) => customerEntitlement.balance === 200,
	);
	const survivingCustomerEntitlement = poolCustomerEntitlements.find(
		(customerEntitlement) => customerEntitlement.balance === 500,
	);
	if (!consumedCustomerEntitlement || !survivingCustomerEntitlement) {
		throw new Error("Expected one consumed and one untouched pooled balance");
	}

	const consumedPool = pools.find(
		(pool) => pool.customer_entitlement_id === consumedCustomerEntitlement.id,
	);
	if (!consumedPool) throw new Error("Expected consumed pooled balance");
	const consumedContribution =
		await ctx.db.query.pooledBalanceContributions.findFirst({
			where: eq(pooledBalanceContributions.pooled_balance_id, consumedPool.id),
		});
	if (!consumedContribution) {
		throw new Error("Expected consumed pooled contribution");
	}

	const fullSubject = await getOrSetCachedFullSubject({
		ctx,
		customerId,
		entityId: entities[2].id,
		source: "pooled-rebalance-race",
	});

	let signalCacheMutation: (() => void) | undefined;
	const cacheMutationApplied = new Promise<void>((resolve) => {
		signalCacheMutation = resolve;
	});
	let releaseCacheMutation: (() => void) | undefined;
	const cacheMutationRelease = new Promise<void>((resolve) => {
		releaseCacheMutation = resolve;
	});
	let cacheMutationSignaled = false;
	const signalAndWait = async (): Promise<void> => {
		if (cacheMutationSignaled) return;
		cacheMutationSignaled = true;
		signalCacheMutation?.();
		await cacheMutationRelease;
	};

	const redisV2 = new Proxy(ctx.redisV2, {
		get(target, property) {
			if (property === "updateSubjectBalanceBatches") {
				return async (...args: [number, string, ...string[]]) => {
					const [, ...keysAndArgs] = args;
					const params = JSON.parse(
						keysAndArgs[keysAndArgs.length - 1] ?? "{}",
					) as RedisBalanceBatches;
					const updatesSurvivingBalance = params.batches?.some((batch) =>
						batch.updates?.some(
							(update) =>
								update.cus_ent_id === survivingCustomerEntitlement.id &&
								(update.balance_delta ?? 0) < 0,
						),
					);
					if (updatesSurvivingBalance) await signalAndWait();
					return target.updateSubjectBalanceBatches(...args);
				};
			}

			const value = Reflect.get(target, property, target) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as AutumnContext["redisV2"];
	const raceContext = { ...ctx, redisV2 } as AutumnContext;

	const removalPromise = executePooledBalanceOps({
		ctx: raceContext,
		customerId,
		pooledBalanceOps: [
			{
				op: "remove_contribution",
				internalCustomerId: internalCustomer.internal_id,
				sourceCustomerProductId:
					consumedContribution.source_customer_product_id,
				sourceEntitlementId: consumedContribution.source_entitlement_id,
				effectiveAt: null,
			},
		],
	});

	let deductionError: unknown;
	try {
		await waitForBarrier({
			barrier: cacheMutationApplied,
			timeoutMs: 5000,
		});
		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		);
		if (!messagesFeature) throw new Error("Expected messages feature");

		await executeRedisDeductionV2({
			ctx: raceContext,
			fullSubject: structuredClone(fullSubject),
			entityId: entities[2].id,
			deductions: [{ feature: messagesFeature, deduction: 100 }],
			deductionOptions: { overageBehaviour: "reject" },
		});
	} catch (error) {
		deductionError = error;
	} finally {
		releaseCacheMutation?.();
	}

	await removalPromise;
	expect(deductionError).toBeUndefined();

	const cachedBalances = await getCachedFeatureBalance({
		ctx: raceContext,
		customerId,
		featureId: TestFeature.Messages,
		customerEntitlementIds: [
			consumedCustomerEntitlement.id,
			survivingCustomerEntitlement.id,
		],
		readMaster: true,
	});
	expect(cachedBalances.kind).toBe("ok");
	if (cachedBalances.kind !== "ok") {
		throw new Error(`Expected cached balances: ${cachedBalances.reason}`);
	}
	expect(
		cachedBalances.value.balances
			.map((balance) => ({
				adjustment: balance.adjustment,
				balance: balance.balance,
			}))
			.sort((first, second) => first.balance - second.balance),
	).toEqual([
		{ adjustment: 0, balance: 0 },
		{ adjustment: 500, balance: 100 },
	]);

	const [cachedCheck, databaseCheck] = await Promise.all([
		autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		}),
		autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		}),
	]);
	for (const check of [cachedCheck, databaseCheck]) {
		expect(check.balance).toMatchObject({
			granted: 500,
			remaining: 100,
			usage: 400,
		});
	}
}, 60_000);
