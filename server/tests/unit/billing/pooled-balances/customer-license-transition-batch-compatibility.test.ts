import { beforeEach, expect, mock, test } from "bun:test";

const calls = {
	batchTriggers: [] as unknown[][],
	carryState: [] as unknown[],
	executionOrder: [] as string[],
	inserts: [] as unknown[],
	repoints: [] as unknown[],
	updates: [] as unknown[],
};

let assignments: unknown[] = [];
let targetCustomerProduct: unknown;
let entitlementTransitions: unknown[] = [];

type MockCustomerEntitlement = Record<string, unknown> & {
	entitlement: { id: string };
};

type MockCustomerProduct = Record<string, unknown> & {
	id: string;
	customer_entitlements: MockCustomerEntitlement[];
};

mock.module(
	"@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js",
	() => ({
		computeProductTransitions: () => ({
			basePrice: undefined,
			customerProduct: undefined,
			entitlementPrices: {
				transitions: entitlementTransitions,
				added: [],
				deleted: [],
			},
			toProduct: {},
		}),
	}),
);

mock.module(
	"@/internal/billing/v2/actions/batchTransition/tasks/batchTransitionTask.js",
	() => ({
		batchTransitionTask: {
			trigger: async (...args: unknown[]) => {
				calls.batchTriggers.push(args);
				calls.executionOrder.push("batch trigger");
			},
		},
	}),
);

mock.module(
	"@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition.js",
	() => ({ isSameRowTransition: () => false }),
);

mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js",
	() => ({
		executePooledBalanceOps: async ({
			beforeDatabaseOperations,
			beforeRebalance,
		}: {
			beforeDatabaseOperations?: (args: { db: unknown }) => Promise<void>;
			beforeRebalance?: (args: { db: unknown }) => Promise<void>;
		}) => {
			calls.executionOrder.push("pooled transaction");
			await beforeDatabaseOperations?.({ db: {} });
			await beforeRebalance?.({ db: {} });
			calls.executionOrder.push("pooled commit");
		},
	}),
);

mock.module(
	"@/internal/billing/v2/pooledBalances/compute/extractPooledBalanceOps.js",
	() => ({
		extractPooledBalanceOps: ({
			customerProduct,
		}: {
			customerProduct: MockCustomerProduct;
		}) => ({
			customerProduct: {
				...customerProduct,
				customer_entitlements: customerProduct.customer_entitlements.map(
					(customerEntitlement) => ({
						...customerEntitlement,
						balance: 0,
						adjustment: 0,
						additional_balance: 0,
						entities: null,
					}),
				),
			},
			pooledBalanceOps: customerProduct.customer_entitlements.map(
				(customerEntitlement) => ({
					op: "upsert_source" as const,
					internalCustomerId: "internal_customer",
					featureId: "messages",
					internalFeatureId: "internal_messages",
					interval: "month" as const,
					intervalCount: 1,
					resetCycleAnchor: 100,
					nextResetAt: 200,
					rollover: null,
					resetOwnerType: "customer_product" as const,
					resetOwnerId: "parent_new",
					priceId: null,
					sourceCustomerProductId: customerProduct.id,
					sourceEntitlementId: customerEntitlement.entitlement.id,
					currentCycleContribution: 500,
					nextCycleContribution: 500,
				}),
			),
		}),
	}),
);

mock.module(
	"@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js",
	() => ({
		pooledBalanceRepo: {
			listContributionsBySourceCustomerProductIds: async () => [],
			listByIds: async () => [],
		},
	}),
);

mock.module(
	"@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromCustomerLicense.js",
	() => ({
		initFullCustomerProductFromCustomerLicense: () => targetCustomerProduct,
	}),
);

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		getFull: async () => ({ id: "customer", internal_id: "internal_customer" }),
	},
}));

mock.module("@/internal/customers/cusProducts/CusProductService.js", () => ({
	CusProductService: { list: async () => assignments },
}));

mock.module(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js",
	() => ({
		CusEntService: {
			insert: async (args: unknown) => {
				calls.inserts.push(args);
				calls.executionOrder.push("entitlement insert");
			},
			update: async (args: unknown) => {
				calls.updates.push(args);
				calls.executionOrder.push("entitlement update");
			},
		},
	}),
);

mock.module("@/internal/licenses/repos/customerLicenseRepo.js", () => ({
	customerLicenseRepo: {
		carryCustomerLicenseState: async (args: unknown) => {
			calls.carryState.push(args);
			calls.executionOrder.push("license state");
		},
		repointDefinition: async (args: unknown) => calls.repoints.push(args),
	},
}));

mock.module("@/utils/genUtils.js", () => ({
	generateId: () => "batch_transition_test",
}));

const customerEntitlement = ({
	id,
	entitlementId,
	pooled,
	balance,
}: {
	id: string;
	entitlementId: string;
	pooled: boolean;
	balance: number;
}) => ({
	id,
	customer_product_id: "assignment",
	entitlement_id: entitlementId,
	internal_customer_id: "internal_customer",
	internal_entity_id: null,
	internal_feature_id: "internal_messages",
	feature_id: "messages",
	customer_id: "customer",
	created_at: 1,
	unlimited: false,
	balance,
	additional_balance: 0,
	adjustment: 0,
	entities: null,
	usage_allowed: false,
	separate_interval: false,
	reset_cycle_anchor: 100,
	next_reset_at: 200,
	expires_at: null,
	cache_version: 0,
	external_id: null,
	entitlement: {
		id: entitlementId,
		internal_feature_id: "internal_messages",
		pooled,
		feature: { id: "messages" },
	},
	replaceables: [],
	rollovers: [],
});

const transition = {
	outgoingCustomerLicense: {
		id: "license_old",
		plan_license_id: "plan_license_old",
		planLicense: { product: { id: "seat_old", internal_id: "seat_old_i" } },
	},
	incomingCustomerLicense: {
		id: "license_new",
		internal_customer_id: "internal_customer",
		parent_customer_product_id: "parent_new",
		plan_license_id: "plan_license_new",
		planLicense: {
			id: "plan_license_new",
			included: 1,
			product: { id: "seat_new", internal_id: "seat_new_i" },
		},
	},
	updates: {
		linkId: "license_link",
		granted: 2,
		remaining: 1,
		paidQuantity: 1,
	},
};

const parentCustomerProduct = {
	id: "parent_new",
	internal_customer_id: "internal_customer",
	internal_entity_id: null,
	status: "active",
	created_at: 100,
	billing_cycle_anchor: 100,
	customer_entitlements: [],
};

const assignment = (customerEntitlements: unknown[]) => ({
	id: "assignment",
	internal_customer_id: "internal_customer",
	internal_entity_id: "entity_internal",
	customer_license_link_id: "license_link",
	status: "active",
	customer_entitlements: customerEntitlements,
});

const loadCustomerLicenseTransitionModule = () =>
	import(
		// @ts-expect-error - Bun query suffix isolates this module's mocks.
		"@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions.js?pooledBatchCompatibility"
	);

beforeEach(() => {
	for (const value of Object.values(calls)) value.length = 0;
	entitlementTransitions = [];
	targetCustomerProduct = undefined;
	assignments = [];
});

test("prepares a synchronous update before a non-pooled source becomes pooled", async () => {
	const source = customerEntitlement({
		id: "customer_entitlement_old",
		entitlementId: "entitlement_old",
		pooled: false,
		balance: 300,
	});
	const target = customerEntitlement({
		id: "customer_entitlement_generated",
		entitlementId: "entitlement_new",
		pooled: true,
		balance: 500,
	});
	assignments = [assignment([source]), parentCustomerProduct];
	targetCustomerProduct = {
		...assignment([target]),
		id: "generated_customer_product",
	};
	entitlementTransitions = [
		{
			fromEntitlementPrice: { entitlement: source.entitlement },
			toEntitlementPrice: { entitlement: target.entitlement },
		},
	];

	const { prepareCustomerLicenseTransitions } =
		await loadCustomerLicenseTransitionModule();
	const [prepared] = await prepareCustomerLicenseTransitions({
		ctx: {} as never,
		customerLicenseTransitions: [transition as never],
	});

	expect(prepared.pooledTargetCustomerEntitlementMutations).toEqual([
		{
			type: "update",
			id: "customer_entitlement_old",
			target: expect.objectContaining({
				entitlement_id: "entitlement_new",
				balance: 0,
			}),
		},
	]);
});

test("inserts a new pooled entitlement without replacing a separate same-feature source", async () => {
	const existing = customerEntitlement({
		id: "customer_entitlement_existing",
		entitlementId: "entitlement_existing",
		pooled: false,
		balance: 300,
	});
	const target = customerEntitlement({
		id: "customer_entitlement_generated",
		entitlementId: "entitlement_new",
		pooled: true,
		balance: 500,
	});
	assignments = [assignment([existing]), parentCustomerProduct];
	targetCustomerProduct = {
		...assignment([target]),
		id: "generated_customer_product",
	};

	const { prepareCustomerLicenseTransitions } =
		await loadCustomerLicenseTransitionModule();
	const [prepared] = await prepareCustomerLicenseTransitions({
		ctx: {} as never,
		customerLicenseTransitions: [transition as never],
	});

	expect(prepared.pooledTargetCustomerEntitlementMutations).toEqual([
		{
			type: "insert",
			target: expect.objectContaining({
				id: "customer_entitlement_generated",
				customer_product_id: "assignment",
				entitlement_id: "entitlement_new",
				balance: 0,
			}),
		},
	]);
});

test("persists pooled target rows before triggering the latest-dev batch transition", async () => {
	const target = customerEntitlement({
		id: "customer_entitlement_generated",
		entitlementId: "entitlement_new",
		pooled: true,
		balance: 0,
	});
	const prepared = {
		transition,
		fullCustomerId: "customer",
		operations: [{ op: "remove_source" }],
		restoredCustomerEntitlements: [],
		pooledTargetCustomerEntitlementMutations: [
			{ type: "insert" as const, target },
		],
	};
	const {
		executePreparedCustomerLicenseTransitionRows,
		triggerPreparedCustomerLicenseBatchTransitions,
	} = await loadCustomerLicenseTransitionModule();

	await executePreparedCustomerLicenseTransitionRows({
		ctx: { db: {} } as never,
		preparedTransitions: [prepared as never],
	});
	expect(calls.carryState).toHaveLength(1);
	expect(calls.inserts).toHaveLength(1);
	expect(calls.batchTriggers).toHaveLength(0);

	await triggerPreparedCustomerLicenseBatchTransitions({
		ctx: {
			org: { id: "org" },
			env: "sandbox",
			customerId: "customer",
		} as never,
		preparedTransitions: [prepared as never],
	});
	expect(calls.batchTriggers).toEqual([
		[
			expect.objectContaining({
				orgId: "org",
				customerId: "customer",
				transition,
				executionScope: expect.objectContaining({
					batchTransitionId: "batch_transition_test",
				}),
			}),
			{ concurrencyKey: "license_link" },
		],
	]);
});

test("restores a pooled source to its successor definition before the batch task", async () => {
	const target = customerEntitlement({
		id: "customer_entitlement_old",
		entitlementId: "entitlement_private",
		pooled: false,
		balance: 500,
	});
	const {
		executeCustomerLicenseTransitions,
		restorePreparedCustomerLicenseEntitlements,
	} = await loadCustomerLicenseTransitionModule();
	const prepared = {
		transition,
		fullCustomerId: "customer",
		operations: [{ op: "remove_source" }],
		pooledTargetCustomerEntitlementMutations: [],
		restoredCustomerEntitlements: [{ id: "customer_entitlement_old", target }],
	};

	await restorePreparedCustomerLicenseEntitlements({
		ctx: { db: {} } as never,
		preparedTransitions: [prepared as never],
	});
	expect(calls.updates[0]).toEqual(
		expect.objectContaining({
			id: "customer_entitlement_old",
			updates: expect.objectContaining({
				entitlement_id: "entitlement_private",
				balance: 500,
			}),
		}),
	);

	for (const value of Object.values(calls)) value.length = 0;
	await executeCustomerLicenseTransitions({
		ctx: {
			db: {},
			org: { id: "org" },
			env: "sandbox",
			customerId: "customer",
		} as never,
		customerLicenseTransitions: [transition as never],
		preparedTransitions: [prepared as never],
	});
	expect(calls.executionOrder).toEqual([
		"pooled transaction",
		"license state",
		"entitlement update",
		"pooled commit",
		"batch trigger",
	]);
});
