import { expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	ExecutePooledBalanceOpsDependencies,
	PooledBalanceTransactionCallback,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { executePooledBalanceOpsWithDependencies } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import {
	type ExecutePooledPlanCustomerProductLifecycleDependencies,
	executePooledPlanCustomerProductLifecycle,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledPlanCustomerProductLifecycle.js";

type TransactionState = {
	products: Record<string, { status: CusProductStatus }>;
	entitlements: Record<string, string>;
	entities: string[];
	licenseRemaining: number;
	contribution: number;
};

const createCustomerProduct = ({ id }: { id: string }) =>
	({
		id,
		product: { id: `product_${id}` },
		customer_entitlements: [],
		customer_prices: [],
	}) as unknown as FullCusProduct;

const createPlan = (): AutumnBillingPlan => {
	const sourceCustomerProduct = createCustomerProduct({ id: "source" });
	return {
		customerId: "customer_one",
		insertEntities: [{ id: "entity_one" } as never],
		insertCustomerProducts: [sourceCustomerProduct],
		customerLicenseUpdates: [
			{ customerLicenseId: "license_one", remainingChange: -1 },
		],
		updateCustomerProducts: [
			{
				customerProduct: sourceCustomerProduct,
				updates: { status: CusProductStatus.Active },
			},
		],
		deleteCustomerProducts: [
			createCustomerProduct({ id: "scheduled_product" }),
		],
		pooledBalanceOps: [
			{
				op: "remove_source",
				internalCustomerId: "internal_customer_one",
				sourceCustomerProductId: "source",
				effectiveAt: null,
			},
		],
	};
};

const createPatchPlan = (): AutumnBillingPlan => {
	const sourceCustomerProduct = createCustomerProduct({ id: "patch_source" });
	return {
		customerId: "customer_one",
		insertCustomerProducts: [],
		patchCustomerProducts: [
			{
				customerProduct: sourceCustomerProduct,
				insertCustomerEntitlements: [{ id: "patched_entitlement" } as never],
				insertCustomerPrices: [],
				deleteCustomerEntitlements: [],
				deleteCustomerPrices: [],
			},
		],
		pooledBalanceOps: [
			{
				op: "remove_source",
				internalCustomerId: "internal_customer_one",
				sourceCustomerProductId: sourceCustomerProduct.id,
				effectiveAt: null,
			},
		],
	};
};

const createHarness = ({
	failAt,
	includePatchSource = false,
}: {
	failAt?: "pooled_operation" | "status_update";
	includePatchSource?: boolean;
}) => {
	let committedState: TransactionState = {
		products: {
			scheduled_product: { status: CusProductStatus.Scheduled },
			...(includePatchSource
				? { patch_source: { status: CusProductStatus.Active } }
				: {}),
		},
		entitlements: {},
		entities: [],
		licenseRemaining: 1,
		contribution: 0,
	};
	let currentFailure = failAt;
	const events: string[] = [];

	const pooledDependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
			onTransactionFailure,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<unknown>;
			onTransactionFailure?: ({ error }: { error: unknown }) => Promise<void>;
		}) => {
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
		executeWithLock: async ({
			ctx,
			beforeDatabaseOperations,
			beforeRebalance,
		}: {
			ctx: AutumnContext;
			beforeDatabaseOperations?: ({ db }: { db: never }) => Promise<void>;
			beforeRebalance?: ({ db }: { db: never }) => Promise<void>;
		}) => {
			await beforeDatabaseOperations?.({ db: ctx.db as never });
			const transactionState = ctx.db as unknown as TransactionState;
			events.push("pooled operation");
			transactionState.contribution += 100;
			if (currentFailure === "pooled_operation") {
				throw new Error("injected pooled operation failure");
			}
			await beforeRebalance?.({ db: ctx.db as never });
			events.push("rebalance and cache cutover");
		},
		invalidateCachesAfterFailure: async () => {},
	} as unknown as ExecutePooledBalanceOpsDependencies;

	const ctx = {
		db: {} as never,
		org: { id: "org_one" },
		env: "test",
		logger: { debug: () => {} },
	} as unknown as AutumnContext;

	const dependencies: ExecutePooledPlanCustomerProductLifecycleDependencies = {
		executePooledBalanceOps: (args) =>
			executePooledBalanceOpsWithDependencies({
				...args,
				dependencies: pooledDependencies,
			}),
		insertEntities: async ({ db, data }) => {
			const transactionState = db as unknown as TransactionState;
			events.push("insert entities");
			for (const entity of data) {
				if (!entity.id) throw new Error("Expected test entity ID");
				transactionState.entities.push(entity.id);
			}
			return data;
		},
		executeCustomerLicenseUpdates: async ({ ctx, customerLicenseUpdates }) => {
			if (!customerLicenseUpdates?.length) return;
			const transactionState = ctx.db as unknown as TransactionState;
			events.push("license updates");
			transactionState.licenseRemaining += (
				customerLicenseUpdates ?? []
			).reduce((sum, update) => sum + update.remainingChange, 0);
		},
		patchCustomerProducts: async ({ ctx, patchCustomerProducts }) => {
			const transactionState = ctx.db as unknown as TransactionState;
			events.push("patch product");
			for (const patch of patchCustomerProducts) {
				for (const customerEntitlement of patch.insertCustomerEntitlements) {
					if (transactionState.entitlements[customerEntitlement.id]) {
						throw new Error(
							`duplicate entitlement '${customerEntitlement.id}'`,
						);
					}
					transactionState.entitlements[customerEntitlement.id] =
						patch.customerProduct.id;
				}
				for (const customerEntitlement of patch.deleteCustomerEntitlements) {
					delete transactionState.entitlements[customerEntitlement.id];
				}
			}
		},
		insertNewCustomerProducts: async ({ ctx, newCusProducts }) => {
			const transactionState = ctx.db as unknown as TransactionState;
			events.push("insert product");
			for (const product of newCusProducts) {
				if (transactionState.products[product.id]) {
					throw new Error(`duplicate product '${product.id}'`);
				}
				transactionState.products[product.id] = {
					status: CusProductStatus.Scheduled,
				};
			}
		},
		updateCustomerProduct: async ({ ctx, cusProductId }) => {
			const transactionState = ctx.db as unknown as TransactionState;
			events.push("status update");
			transactionState.products[cusProductId].status = CusProductStatus.Active;
			if (currentFailure === "status_update") {
				throw new Error("injected status update failure");
			}
		},
		deleteCustomerProduct: async ({ ctx, cusProductId }) => {
			const transactionState = ctx.db as unknown as TransactionState;
			events.push("delete product");
			delete transactionState.products[cusProductId];
		},
	};

	return {
		ctx,
		dependencies,
		events,
		getCommittedState: () => committedState,
		allowRetry: () => {
			currentFailure = undefined;
		},
	};
};

test("pooled-operation failure rolls back license transition rows, source product, capacity, entity, and contribution", async () => {
	const harness = createHarness({ failAt: "pooled_operation" });
	const autumnBillingPlan = createPlan();
	const executeTransitionRows: PooledBalanceTransactionCallback = ({ db }) => {
		const transactionState = db as unknown as TransactionState;
		transactionState.entitlements.transitioned = "license_link";
		return Promise.resolve();
	};

	await expect(
		executePooledPlanCustomerProductLifecycle({
			ctx: harness.ctx,
			autumnBillingPlan,
			afterCustomerProductInserts: executeTransitionRows,
			dependencies: harness.dependencies,
		}),
	).rejects.toThrow("injected pooled operation failure");
	expect(harness.getCommittedState()).toEqual({
		products: {
			scheduled_product: { status: CusProductStatus.Scheduled },
		},
		entitlements: {},
		entities: [],
		licenseRemaining: 1,
		contribution: 0,
	});

	harness.allowRetry();
	await executePooledPlanCustomerProductLifecycle({
		ctx: harness.ctx,
		autumnBillingPlan,
		afterCustomerProductInserts: executeTransitionRows,
		dependencies: harness.dependencies,
	});
	expect(harness.getCommittedState()).toEqual({
		products: { source: { status: CusProductStatus.Active } },
		entitlements: { transitioned: "license_link" },
		entities: ["entity_one"],
		licenseRemaining: 0,
		contribution: 100,
	});
});

test("status-update failure rolls back the source product and contribution, then retry converges", async () => {
	const harness = createHarness({ failAt: "status_update" });
	const autumnBillingPlan = createPlan();

	await expect(
		executePooledPlanCustomerProductLifecycle({
			ctx: harness.ctx,
			autumnBillingPlan,
			dependencies: harness.dependencies,
		}),
	).rejects.toThrow("injected status update failure");
	expect(harness.getCommittedState()).toEqual({
		products: {
			scheduled_product: { status: CusProductStatus.Scheduled },
		},
		entitlements: {},
		entities: [],
		licenseRemaining: 1,
		contribution: 0,
	});

	harness.allowRetry();
	await executePooledPlanCustomerProductLifecycle({
		ctx: harness.ctx,
		autumnBillingPlan,
		dependencies: harness.dependencies,
	});
	expect(harness.getCommittedState()).toEqual({
		products: { source: { status: CusProductStatus.Active } },
		entitlements: {},
		entities: ["entity_one"],
		licenseRemaining: 0,
		contribution: 100,
	});
	expect(harness.events.slice(-7)).toEqual([
		"insert entities",
		"license updates",
		"insert product",
		"pooled operation",
		"status update",
		"delete product",
		"rebalance and cache cutover",
	]);
});

test("pooled-operation failure rolls back an in-place patch and retry converges", async () => {
	const harness = createHarness({
		failAt: "pooled_operation",
		includePatchSource: true,
	});
	const autumnBillingPlan = createPatchPlan();

	await expect(
		executePooledPlanCustomerProductLifecycle({
			ctx: harness.ctx,
			autumnBillingPlan,
			dependencies: harness.dependencies,
		}),
	).rejects.toThrow("injected pooled operation failure");
	expect(harness.getCommittedState()).toEqual({
		products: {
			patch_source: { status: CusProductStatus.Active },
			scheduled_product: { status: CusProductStatus.Scheduled },
		},
		entitlements: {},
		entities: [],
		licenseRemaining: 1,
		contribution: 0,
	});

	harness.allowRetry();
	await executePooledPlanCustomerProductLifecycle({
		ctx: harness.ctx,
		autumnBillingPlan,
		dependencies: harness.dependencies,
	});
	expect(harness.getCommittedState()).toEqual({
		products: {
			patch_source: { status: CusProductStatus.Active },
			scheduled_product: { status: CusProductStatus.Scheduled },
		},
		entitlements: { patched_entitlement: "patch_source" },
		entities: [],
		licenseRemaining: 1,
		contribution: 100,
	});
	expect(harness.events.slice(-4)).toEqual([
		"patch product",
		"insert product",
		"pooled operation",
		"rebalance and cache cutover",
	]);
});

test("post-rebalance work runs after database rebalance and before cache cutover in the same transaction", async () => {
	type State = {
		contribution: number;
		ordinaryBalance: number;
	};

	let committedState: State = {
		contribution: 0,
		ordinaryBalance: 0,
	};
	const events: string[] = [];
	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
		}: {
			callback: ({ db }: { db: State }) => Promise<void>;
		}) => {
			const transactionState = structuredClone(committedState);
			await callback({ db: transactionState });
			committedState = transactionState;
		},
		executeWithLock: async ({
			ctx,
			afterRebalance,
		}: {
			ctx: AutumnContext;
			afterRebalance?: ({ db }: { db: never }) => Promise<void>;
		}) => {
			const transactionState = ctx.db as unknown as State;
			events.push("pooled operation");
			transactionState.contribution = 500;
			events.push("database rebalance");
			await afterRebalance?.({ db: ctx.db as never });
			events.push("cache cutover");
		},
		invalidateCachesAfterFailure: async () => {},
	} as unknown as ExecutePooledBalanceOpsDependencies;

	await executePooledBalanceOpsWithDependencies({
		ctx: {
			db: {} as never,
			org: { id: "org_one" },
			env: "test",
		} as unknown as AutumnContext,
		customerId: "customer_one",
		pooledBalanceOps: createPlan().pooledBalanceOps,
		afterRebalance: async ({ db }) => {
			events.push("restore ordinary grant");
			(db as unknown as State).ordinaryBalance = 500;
		},
		dependencies,
	});

	expect(events).toEqual([
		"pooled operation",
		"database rebalance",
		"restore ordinary grant",
		"cache cutover",
	]);
	expect(committedState).toEqual({
		contribution: 500,
		ordinaryBalance: 500,
	});
});

test("empty pooled operations still run supplied lifecycle callbacks in one balance transaction", async () => {
	const events: string[] = [];
	const database = {};
	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
		}: {
			callback: ({ db }: { db: unknown }) => Promise<unknown>;
		}) => {
			events.push("transaction");
			return callback({ db: database });
		},
		executeWithLock: async ({
			beforeDatabaseOperations,
			beforeRebalance,
			afterRebalance,
		}: {
			beforeDatabaseOperations?: ({ db }: { db: never }) => Promise<void>;
			beforeRebalance?: ({ db }: { db: never }) => Promise<void>;
			afterRebalance?: ({ db }: { db: never }) => Promise<void>;
		}) => {
			await beforeDatabaseOperations?.({ db: database as never });
			await beforeRebalance?.({ db: database as never });
			await afterRebalance?.({ db: database as never });
		},
		applyCacheCutover: async () => {
			events.push("cache cutover");
		},
	} as unknown as ExecutePooledBalanceOpsDependencies;

	await executePooledBalanceOpsWithDependencies({
		ctx: {} as never,
		customerId: "customer_one",
		pooledBalanceOps: [],
		beforeDatabaseOperations: async () => {
			events.push("before database operations");
		},
		beforeRebalance: async () => {
			events.push("before rebalance");
		},
		afterRebalance: async () => {
			events.push("after rebalance");
		},
		dependencies,
	});

	expect(events).toEqual([
		"transaction",
		"before database operations",
		"before rebalance",
		"after rebalance",
	]);
});

test("post-rebalance failure rolls back pooled and restoration mutations together", async () => {
	type State = {
		contribution: number;
		ordinaryBalance: number;
	};

	let committedState: State = {
		contribution: 0,
		ordinaryBalance: 0,
	};
	let failureInvalidatedCaches = false;
	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
			onTransactionFailure,
		}: {
			callback: ({ db }: { db: State }) => Promise<void>;
			onTransactionFailure?: ({ error }: { error: unknown }) => Promise<void>;
		}) => {
			const transactionState = structuredClone(committedState);
			try {
				await callback({ db: transactionState });
				committedState = transactionState;
			} catch (error) {
				await onTransactionFailure?.({ error });
				throw error;
			}
		},
		executeWithLock: async ({
			ctx,
			afterRebalance,
		}: {
			ctx: AutumnContext;
			afterRebalance?: ({ db }: { db: never }) => Promise<void>;
		}) => {
			(ctx.db as unknown as State).contribution = 500;
			await afterRebalance?.({ db: ctx.db as never });
		},
		invalidateCachesAfterFailure: async () => {
			failureInvalidatedCaches = true;
		},
	} as unknown as ExecutePooledBalanceOpsDependencies;

	await expect(
		executePooledBalanceOpsWithDependencies({
			ctx: {
				db: {} as never,
				org: { id: "org_one" },
				env: "test",
			} as unknown as AutumnContext,
			customerId: "customer_one",
			pooledBalanceOps: createPlan().pooledBalanceOps,
			afterRebalance: async ({ db }) => {
				(db as unknown as State).ordinaryBalance = 500;
				throw new Error("injected restoration failure");
			},
			dependencies,
		}),
	).rejects.toThrow("injected restoration failure");

	expect(committedState).toEqual({
		contribution: 0,
		ordinaryBalance: 0,
	});
	expect(failureInvalidatedCaches).toBe(false);
});
