import { beforeEach, expect, test } from "bun:test";
import {
	EntInterval,
	type FeatureOptions,
	type FullCusProduct,
	type PooledBalanceOp,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js";
import {
	type ProcessPrepaidPricesDependencies,
	processPrepaidPricesForInvoiceCreatedWithDependencies,
} from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated.js";
import { computePooledContributionTransition } from "@/internal/billing/v2/pooledBalances/compute/computePooledContributionTransition.js";

type UpsertSourceOperation = Extract<PooledBalanceOp, { op: "upsert_source" }>;

let pooledBatchCalls: PooledBalanceOp[][] = [];
let customerProductOptionUpdates: FeatureOptions[][] = [];
let sourceEntitlementUpdates: Record<string, unknown>[] = [];
let legacySourceDecrements = 0;
let poolBalance = 0;
let contributionBySource = new Map<
	string,
	{ currentCycleContribution: number; nextCycleContribution: number }
>();

const createDependencies = (): ProcessPrepaidPricesDependencies =>
	({
		withCustomerBalanceSyncLock: async ({
			callback,
		}: Parameters<
			ProcessPrepaidPricesDependencies["withCustomerBalanceSyncLock"]
		>[0]) => callback({ db: {} as never }),
		updateCustomerProduct: async ({
			updates,
		}: {
			updates: { options: FeatureOptions[] };
		}) => {
			customerProductOptionUpdates.push(updates.options);
		},
		updateCustomerEntitlement: async ({
			updates,
		}: {
			updates: Record<string, unknown>;
		}) => {
			sourceEntitlementUpdates.push(updates);
		},
		decrementCustomerEntitlement: async () => {
			legacySourceDecrements += 1;
		},
		insertRollovers: async () => {},
		executePooledBalanceOps: async ({
			pooledBalanceOps,
		}: {
			pooledBalanceOps?: PooledBalanceOp[];
		}) => {
			const operations = pooledBalanceOps ?? [];
			pooledBatchCalls.push(operations);
			for (const operation of operations) {
				if (operation.op !== "upsert_source") continue;
				const transition = computePooledContributionTransition({
					previous:
						contributionBySource.get(operation.sourceCustomerProductId) ?? null,
					desired: {
						currentCycleContribution: operation.currentCycleContribution,
						nextCycleContribution: operation.nextCycleContribution,
					},
				});
				poolBalance += transition.contributionDelta;
				contributionBySource.set(
					operation.sourceCustomerProductId,
					transition.next,
				);
			}
		},
		resetPooledBalancesByResetOwner: async () => [],
		deleteCachedFullCustomer: async () => {},
	}) as unknown as ProcessPrepaidPricesDependencies;

const createLifetimePooledSource = ({
	id,
	quantity = 2,
	upcomingQuantity = 5,
}: {
	id: string;
	quantity?: number;
	upcomingQuantity?: number;
}): FullCusProduct => {
	const entitlementId = `entitlement_${id}`;
	const customerEntitlement = customerEntitlements.create({
		id: `customer_entitlement_${id}`,
		entitlementId,
		featureId: "messages",
		featureName: "Messages",
		allowance: 50,
		balance: 0,
		customerProductId: id,
		interval: EntInterval.Lifetime,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};
	const prepaidPrice = prices.createPrepaid({
		id: `price_${id}`,
		featureId: "messages",
		billingUnits: 10,
		entitlementId,
	});

	return customerProducts.create({
		id,
		customerEntitlements: [customerEntitlement],
		customerPrices: [
			prices.createCustomer({ price: prepaidPrice, customerProductId: id }),
		],
		internalEntityId: `internal_entity_${id}`,
		entityId: `entity_${id}`,
		subscriptionIds: ["subscription_one"],
		options: [
			{
				feature_id: "messages",
				internal_feature_id: "internal_messages",
				quantity,
				upcoming_quantity: upcomingQuantity,
			},
		],
	});
};

const createEventContext = ({
	customerProducts: sourceCustomerProducts,
}: {
	customerProducts: FullCusProduct[];
}): InvoiceCreatedContext => {
	const fullCustomer = customers.create({
		customerProducts: sourceCustomerProducts,
	});
	return {
		stripeInvoice: {
			billing_reason: "subscription_cycle",
			period_end: 2_000,
		},
		stripeSubscription: {
			id: "subscription_one",
			metadata: {},
			items: {
				data: [{ current_period_start: 1_000, current_period_end: 2_000 }],
			},
		},
		stripeCustomer: {},
		stripeSubscriptionId: "subscription_one",
		fullCustomer,
		customerProducts: sourceCustomerProducts,
		nowMs: 1_000_000,
		paymentMethod: null,
	} as unknown as InvoiceCreatedContext;
};

const createContext = () =>
	({
		features: [],
		org: { id: "org_test" },
		env: "sandbox",
		extraLogs: {},
		logger: { info: () => {}, debug: () => {}, warn: () => {} },
	}) as never;

beforeEach(() => {
	pooledBatchCalls = [];
	customerProductOptionUpdates = [];
	sourceEntitlementUpdates = [];
	legacySourceDecrements = 0;
	poolBalance = 70;
	contributionBySource = new Map([
		[
			"lifetime_source",
			{ currentCycleContribution: 70, nextCycleContribution: 100 },
		],
	]);
});

// Red: renewal decremented the zeroed source row; green: it writes an absolute pooled grant.
test("promotes a pooled lifetime prepaid quantity and stale replay does not remint", async () => {
	await processPrepaidPricesForInvoiceCreatedWithDependencies({
		ctx: createContext(),
		dependencies: createDependencies(),
		eventContext: createEventContext({
			customerProducts: [createLifetimePooledSource({ id: "lifetime_source" })],
		}),
	});
	await processPrepaidPricesForInvoiceCreatedWithDependencies({
		ctx: createContext(),
		dependencies: createDependencies(),
		eventContext: createEventContext({
			customerProducts: [createLifetimePooledSource({ id: "lifetime_source" })],
		}),
	});

	expect(legacySourceDecrements).toBe(0);
	expect(pooledBatchCalls).toHaveLength(2);
	for (const batch of pooledBatchCalls) {
		expect(batch).toHaveLength(1);
		expect(batch[0]).toMatchObject({
			op: "upsert_source",
			currentCycleContribution: 100,
			nextCycleContribution: 100,
		});
	}
	expect(poolBalance).toBe(100);
	expect(contributionBySource.get("lifetime_source")).toEqual({
		currentCycleContribution: 100,
		nextCycleContribution: 100,
	});
	expect(sourceEntitlementUpdates).toEqual([
		expect.objectContaining({
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
			next_reset_at: null,
		}),
		expect.objectContaining({
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
			next_reset_at: null,
		}),
	]);
	expect(customerProductOptionUpdates).toHaveLength(2);
	expect(customerProductOptionUpdates[0]?.[0]).toMatchObject({
		quantity: 5,
	});
	expect(
		customerProductOptionUpdates[0]?.[0]?.upcoming_quantity,
	).toBeUndefined();
});

test("collects multiple pooled lifetime renewals into one invoice batch", async () => {
	poolBalance = 140;
	contributionBySource = new Map([
		[
			"lifetime_source_one",
			{ currentCycleContribution: 70, nextCycleContribution: 100 },
		],
		[
			"lifetime_source_two",
			{ currentCycleContribution: 70, nextCycleContribution: 100 },
		],
	]);

	await processPrepaidPricesForInvoiceCreatedWithDependencies({
		ctx: createContext(),
		dependencies: createDependencies(),
		eventContext: createEventContext({
			customerProducts: [
				createLifetimePooledSource({ id: "lifetime_source_one" }),
				createLifetimePooledSource({ id: "lifetime_source_two" }),
			],
		}),
	});

	expect(pooledBatchCalls).toHaveLength(1);
	expect(
		(pooledBatchCalls[0] as UpsertSourceOperation[]).map(
			(operation) => operation.sourceCustomerProductId,
		),
	).toEqual(["lifetime_source_one", "lifetime_source_two"]);
	expect(poolBalance).toBe(200);
});

test("applies the final lifetime cutover after reset and outer transaction commit", async () => {
	const events: string[] = [];
	const preparedCutover = { marker: "invoice cutover" };
	const dependencies = {
		...createDependencies(),
		withCustomerBalanceSyncLock: async ({
			callback,
		}: Parameters<
			ProcessPrepaidPricesDependencies["withCustomerBalanceSyncLock"]
		>[0]) => {
			events.push("transaction start");
			const result = await callback({ db: {} as never });
			events.push("postgres commit");
			return result;
		},
		resetPooledBalancesByResetOwner: async () => {
			events.push("subscription reset");
			return [{ applied: true }] as never;
		},
		executePooledBalanceOps: async () => {
			events.push("lifetime database mutations");
			return preparedCutover as never;
		},
		applyPooledBalanceCacheCutover: async ({ prepared }) => {
			expect(prepared).toBe(preparedCutover as never);
			events.push("redis cache cutover");
		},
	} as ProcessPrepaidPricesDependencies;

	await processPrepaidPricesForInvoiceCreatedWithDependencies({
		ctx: createContext(),
		dependencies,
		eventContext: createEventContext({
			customerProducts: [createLifetimePooledSource({ id: "lifetime_source" })],
		}),
	});

	expect(events).toEqual([
		"transaction start",
		"subscription reset",
		"lifetime database mutations",
		"postgres commit",
		"redis cache cutover",
	]);
});

test("captures a recurring pooled reset before advancing the source reset timestamp", async () => {
	const previousResetAt = 1_000_000;
	const nextResetAt = 2_000_000;
	const transactionDatabase = {};
	const events: string[] = [];
	const operationDatabases: unknown[] = [];
	const cacheInvalidationFlushes: Array<boolean | undefined> = [];
	let sourceResetAt = previousResetAt;

	const recurringSource = createLifetimePooledSource({
		id: "recurring_source",
		quantity: 2,
		upcomingQuantity: 2,
	});
	recurringSource.customer_entitlements[0]!.entitlement.interval =
		EntInterval.Month;
	recurringSource.customer_entitlements[0]!.next_reset_at = previousResetAt;
	recurringSource.options[0]!.upcoming_quantity = undefined;

	const dependencies = {
		...createDependencies(),
		withCustomerBalanceSyncLock: async ({
			callback,
		}: Parameters<
			ProcessPrepaidPricesDependencies["withCustomerBalanceSyncLock"]
		>[0]) => callback({ db: transactionDatabase as never }),
		updateCustomerEntitlement: async ({
			ctx,
			updates,
		}: Parameters<
			ProcessPrepaidPricesDependencies["updateCustomerEntitlement"]
		>[0]) => {
			events.push("source reset timestamp update");
			operationDatabases.push(ctx.db);
			sourceResetAt = updates.next_reset_at as number;
		},
		resetPooledBalancesByResetOwner: async ({
			ctx,
			balanceSyncDb,
		}: Parameters<
			ProcessPrepaidPricesDependencies["resetPooledBalancesByResetOwner"]
		>[0]) => {
			events.push("strict pooled reset capture");
			operationDatabases.push(balanceSyncDb ?? ctx.db);
			if (sourceResetAt !== previousResetAt) {
				throw new Error("RESET_AT_MISMATCH");
			}
			return [{ applied: true }] as never;
		},
		executePooledBalanceOps: async ({
			ctx,
			balanceSyncDb,
		}: Parameters<
			ProcessPrepaidPricesDependencies["executePooledBalanceOps"]
		>[0]) => {
			events.push("pooled balance operations");
			operationDatabases.push(balanceSyncDb ?? ctx.db);
		},
		deleteCachedFullCustomer: async ({
			flushBalances,
		}: Parameters<
			ProcessPrepaidPricesDependencies["deleteCachedFullCustomer"]
		>[0]) => {
			events.push("post-reset cache cleanup");
			cacheInvalidationFlushes.push(flushBalances);
		},
	} as unknown as ProcessPrepaidPricesDependencies;

	await processPrepaidPricesForInvoiceCreatedWithDependencies({
		ctx: createContext(),
		dependencies,
		eventContext: createEventContext({
			customerProducts: [recurringSource],
		}),
	});

	expect(sourceResetAt).toBe(nextResetAt);
	expect(events).toEqual([
		"strict pooled reset capture",
		"source reset timestamp update",
		"pooled balance operations",
		"post-reset cache cleanup",
	]);
	expect(cacheInvalidationFlushes).toEqual([undefined]);
	expect(operationDatabases).toHaveLength(3);
	expect(
		operationDatabases.every((database) => database === transactionDatabase),
	).toBe(true);
});

type RenewalTransactionState = {
	sourceBalance: number;
	sourceAdjustment: number;
	optionQuantity: number;
	upcomingQuantity?: number;
	contribution: number;
	resetApplied: boolean;
};

// Red: reset failure left earlier pooled renewal writes committed; green: all roll back together.
test("rolls back source zeroing, contribution, and option promotion when the pooled reset fails", async () => {
	let committedState: RenewalTransactionState = {
		sourceBalance: 70,
		sourceAdjustment: 70,
		optionQuantity: 2,
		upcomingQuantity: 5,
		contribution: 70,
		resetApplied: false,
	};
	const initialState = structuredClone(committedState);
	let failReset = true;
	let transactionCalls = 0;
	let cacheInvalidations = 0;
	const cacheInvalidationFlushes: Array<boolean | undefined> = [];
	const operationDatabases: unknown[] = [];
	const resolveState = ({
		ctx,
		balanceSyncDb,
	}: {
		ctx?: { db?: unknown };
		balanceSyncDb?: unknown;
	}) => (balanceSyncDb ?? ctx?.db ?? committedState) as RenewalTransactionState;

	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
			onTransactionFailure,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<unknown>;
			onTransactionFailure?: ({ error }: { error: unknown }) => Promise<void>;
		}) => {
			transactionCalls += 1;
			const transactionState = structuredClone(committedState);
			try {
				const result = await callback({ db: transactionState });
				committedState = transactionState;
				return result;
			} catch (error) {
				await onTransactionFailure?.({ error });
				throw error;
			}
		},
		updateCustomerProduct: async ({
			ctx,
			updates,
		}: Parameters<
			ProcessPrepaidPricesDependencies["updateCustomerProduct"]
		>[0]) => {
			const state = resolveState({ ctx });
			operationDatabases.push(ctx?.db);
			const options = updates.options as FeatureOptions[];
			state.optionQuantity = options[0].quantity ?? 0;
			state.upcomingQuantity = options[0].upcoming_quantity ?? undefined;
		},
		updateCustomerEntitlement: async ({
			ctx,
		}: Parameters<
			ProcessPrepaidPricesDependencies["updateCustomerEntitlement"]
		>[0]) => {
			const state = resolveState({ ctx });
			operationDatabases.push(ctx?.db);
			state.sourceBalance = 0;
			state.sourceAdjustment = 0;
		},
		decrementCustomerEntitlement: async () => {},
		insertRollovers: async () => {},
		executePooledBalanceOps: async ({
			ctx,
			balanceSyncDb,
		}: Parameters<
			ProcessPrepaidPricesDependencies["executePooledBalanceOps"]
		>[0]) => {
			const state = resolveState({ ctx, balanceSyncDb });
			operationDatabases.push(balanceSyncDb ?? ctx?.db);
			state.contribution = 100;
		},
		resetPooledBalancesByResetOwner: async ({
			ctx,
			balanceSyncDb,
		}: Parameters<
			ProcessPrepaidPricesDependencies["resetPooledBalancesByResetOwner"]
		>[0]) => {
			const state = resolveState({ ctx, balanceSyncDb });
			operationDatabases.push(balanceSyncDb ?? ctx?.db);
			const stateBeforeReset = structuredClone(state);
			state.resetApplied = true;
			if (failReset) {
				Object.assign(state, stateBeforeReset);
				throw new Error("injected pooled reset failure");
			}
			return [{ applied: true }];
		},
		deleteCachedFullCustomer: async ({
			flushBalances,
		}: Parameters<
			ProcessPrepaidPricesDependencies["deleteCachedFullCustomer"]
		>[0]) => {
			cacheInvalidations += 1;
			cacheInvalidationFlushes.push(flushBalances);
		},
	} as unknown as ProcessPrepaidPricesDependencies;
	const runRenewal = () =>
		processPrepaidPricesForInvoiceCreatedWithDependencies({
			ctx: createContext(),
			dependencies,
			eventContext: createEventContext({
				customerProducts: [
					createLifetimePooledSource({ id: "lifetime_source" }),
				],
			}),
		});

	await expect(runRenewal()).rejects.toThrow("injected pooled reset failure");
	expect(committedState).toEqual(initialState);
	expect(transactionCalls).toBe(1);
	expect(cacheInvalidations).toBe(1);

	failReset = false;
	operationDatabases.length = 0;
	await runRenewal();
	expect(committedState).toEqual({
		sourceBalance: 0,
		sourceAdjustment: 0,
		optionQuantity: 5,
		upcomingQuantity: undefined,
		contribution: 100,
		resetApplied: true,
	});
	expect(transactionCalls).toBe(2);
	expect(cacheInvalidations).toBe(2);
	expect(cacheInvalidationFlushes).toEqual([true, undefined]);
	expect(operationDatabases).toHaveLength(4);
	expect(operationDatabases.every((db) => db === operationDatabases[0])).toBe(
		true,
	);
});
