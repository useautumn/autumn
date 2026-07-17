/**
 * A pooled cache cutover must not become visible before its Postgres transaction commits.
 * Pre-fix, a successful track in that window is deleted when the commit fails; post-fix, the old cache retains the deduction.
 */
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
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePooledBalanceOps } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
};

const waitForPoolBalances = async ({
	ctx,
	customerEntitlementIds,
	expectedBalances,
}: {
	ctx: AutumnContext;
	customerEntitlementIds: string[];
	expectedBalances: number[];
}) => {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const rows = await ctx.db.query.customerEntitlements.findMany({
			where: inArray(customerEntitlements.id, customerEntitlementIds),
		});
		const balances = rows.map((row) => row.balance);
		if (
			expectedBalances.every((expectedBalance) =>
				balances.includes(expectedBalance),
			)
		) {
			return rows;
		}
		await Bun.sleep(100);
	}
	throw new Error("Timed out waiting for the initial pooled balances to sync");
};

test(`${chalk.yellowBright("licenses pooled commit race: a failed lifecycle commit cannot erase a successful concurrent track")}`, async () => {
	const hourlyPlan = products.base({
		id: "pooled-failed-commit-hourly",
		isAddOn: true,
		items: [
			{
				...items.hourlyMessages({ includedUsage: 500 }),
				pooled: true,
			},
		],
	});
	const monthlyPlan = products.base({
		id: "pooled-failed-commit-monthly",
		isAddOn: true,
		items: [
			{
				...items.monthlyMessages({ includedUsage: 500 }),
				pooled: true,
			},
		],
	});

	const { customerId, entities, autumnV2_2, ctx } = await initScenario({
		customerId: "license-pooled-failed-commit-track-race",
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
	const poolEntitlements = await waitForPoolBalances({
		ctx,
		customerEntitlementIds: pools.map((pool) => pool.customer_entitlement_id),
		expectedBalances: [200, 500],
	});
	const consumedEntitlement = poolEntitlements.find(
		(customerEntitlement) => customerEntitlement.balance === 200,
	);
	if (!consumedEntitlement) {
		throw new Error("Expected the hourly pool to contain the initial usage");
	}
	const consumedPool = pools.find(
		(pool) => pool.customer_entitlement_id === consumedEntitlement.id,
	);
	if (!consumedPool) throw new Error("Expected consumed pooled balance");
	const contribution = await ctx.db.query.pooledBalanceContributions.findFirst({
		where: eq(pooledBalanceContributions.pooled_balance_id, consumedPool.id),
	});
	if (!contribution) throw new Error("Expected consumed pooled contribution");

	const beforeCommit = deferred();
	const allowCommitFailure = deferred();
	const failingDb = new Proxy(ctx.db, {
		get(target, property, receiver) {
			if (property === "transaction") {
				return async <T>(
					callback: (transaction: DrizzleCli) => Promise<T>,
					config?: Parameters<DrizzleCli["transaction"]>[1],
				) =>
					target.transaction(async (transaction) => {
						await callback(transaction as unknown as DrizzleCli);
						beforeCommit.resolve();
						await allowCommitFailure.promise;
						throw new Error("injected pooled lifecycle commit failure");
					}, config);
			}
			const value = Reflect.get(target, property, receiver) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as DrizzleCli;
	const raceContext = { ...ctx, db: failingDb } as AutumnContext;

	const removalResult = executePooledBalanceOps({
		ctx: raceContext,
		customerId,
		pooledBalanceOps: [
			{
				op: "remove_contribution",
				internalCustomerId: internalCustomer.internal_id,
				sourceCustomerProductId: contribution.source_customer_product_id,
				sourceEntitlementId: contribution.source_entitlement_id,
				effectiveAt: null,
			},
		],
	}).then(
		() => undefined,
		(error: unknown) => error,
	);

	await beforeCommit.promise;
	await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[2].id,
		feature_id: TestFeature.Messages,
		value: 100,
		overage_behavior: "reject",
	});
	allowCommitFailure.resolve();

	const removalError = await removalResult;
	expect(removalError).toBeInstanceOf(Error);
	expect((removalError as Error).message).toBe(
		"injected pooled lifecycle commit failure",
	);

	const cachedCheck = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[2].id,
		feature_id: TestFeature.Messages,
	});
	expect(cachedCheck.balance).toMatchObject({
		granted: 1000,
		remaining: 600,
		usage: 400,
	});
}, 60_000);
