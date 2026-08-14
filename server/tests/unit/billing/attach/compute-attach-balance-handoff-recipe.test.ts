import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	AttachBillingContext,
	AttachParamsV1,
	PooledBalancePlan,
} from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan.js";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import { _setMiscellaneousEdgeConfigForTesting } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const sourceCustomerProduct = customerProducts.create({
	id: "source_customer_product",
	productId: "source",
	customerEntitlements: [
		customerEntitlements.create({
			id: "source_balance",
			customerProductId: "source_customer_product",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
		}),
	],
});
const targetCustomerProduct = customerProducts.create({
	id: "target_customer_product",
	productId: "target",
});
const state = {
	pooledBalancePlan: undefined as PooledBalancePlan | undefined,
	carriedBalanceRows: [] as unknown[],
	oneOffPrepaidRows: [] as unknown[],
};

await mockModuleWithRestore(
	"@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct.js",
	() => ({
		computeAttachNewCustomerProduct: () => targetCustomerProduct,
	}),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalancePlan.js",
	() => ({
		computeAttachPooledBalancePlan: () => ({
			customerProduct: targetCustomerProduct,
			pooledBalancePlan: state.pooledBalancePlan,
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/utils/handleCarryOvers/cusProductToExistingBalanceCarryOvers.js",
	() => ({
		cusProductToExistingBalanceCarryOvers: () => ({
			entitlements: [],
			customerEntitlements: state.carriedBalanceRows,
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers.js",
	() => ({
		cusProductToOneOffPrepaidCarryOvers: () => ({
			entitlements: [],
			customerEntitlements: state.oneOffPrepaidRows,
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/actions/attach/compute/computeOneOffPurchaseRebalance.js",
	() => ({ computeOneOffPurchaseRebalance: () => undefined }),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/actions/attach/compute/finalizeAttachPlan.js",
	() => ({
		finalizeAttachPlan: ({ plan }: { plan: unknown }) => plan,
	}),
);

const { computeAttachPlan } = await import(
	"@/internal/billing/v2/actions/attach/compute/computeAttachPlan.js"
);

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

const setHandoffEnabled = (enabled: boolean) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: {
			...defaultConfig,
			balanceGenerationHandoff: enabled,
		},
	});
};

const buildAttachContext = ({
	entityId,
	internalEntityId,
}: {
	entityId: string | null;
	internalEntityId: string;
}): AttachBillingContext => {
	const fullCustomer = customers.create({
		customerProducts: [sourceCustomerProduct],
	});
	fullCustomer.entity = {
		id: entityId,
		internal_id: internalEntityId,
		internal_customer_id: fullCustomer.internal_id,
		org_id: fullCustomer.org_id,
		env: AppEnv.Sandbox,
		created_at: 1,
		name: "Entity",
		deleted: false,
		feature_id: "seats",
		internal_feature_id: "internal_seats",
	};

	return {
		fullCustomer,
		attachProduct: products.createFull({ id: "target" }),
		fullProducts: [],
		featureQuantities: [],
		customerLicenseQuantities: [],
		currentEpochMs: 1,
		billingCycleAnchorMs: "now",
		resetCycleAnchorMs: "now",
		customPrices: [],
		customEnts: [],
		isCustom: false,
		billingVersion: targetCustomerProduct.billing_version,
		carryOverSourceCustomerProduct: sourceCustomerProduct,
		planTiming: "immediate",
		checkoutMode: null,
		accessStartsAt: 1,
	} as unknown as AttachBillingContext;
};

const params = {
	plan_id: "target",
	entity_id: "request_alias",
} as AttachParamsV1;

const computePlan = ({
	entityId = "canonical_entity",
	internalEntityId = "internal_entity",
}: {
	entityId?: string | null;
	internalEntityId?: string;
} = {}) =>
	computeAttachPlan({
		ctx: {} as never,
		attachBillingContext: buildAttachContext({ entityId, internalEntityId }),
		params,
	});

describe("computeAttachPlan balance handoff recipe", () => {
	beforeEach(() => setHandoffEnabled(true));

	afterEach(() => {
		state.pooledBalancePlan = undefined;
		state.carriedBalanceRows = [];
		state.oneOffPrepaidRows = [];
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	test("does not create a recipe while the rollout flag is disabled", () => {
		setHandoffEnabled(false);
		expect(computePlan().attachBalanceHandoff).toBeUndefined();
	});

	test("uses the hydrated external entity id instead of the request alias", () => {
		expect(computePlan().attachBalanceHandoff?.entityId).toBe(
			"canonical_entity",
		);
	});

	test("falls back to the hydrated internal entity id", () => {
		expect(computePlan({ entityId: null }).attachBalanceHandoff?.entityId).toBe(
			"internal_entity",
		);
	});

	test("keeps pooled transitions on their existing attach path", () => {
		state.pooledBalancePlan = {
			...emptyPooledBalancePlan(),
			insertPoolBalances: [{} as never],
		};
		expect(computePlan().attachBalanceHandoff).toBeUndefined();
	});

	test("keeps loose carry-over balances on their existing attach path", () => {
		state.carriedBalanceRows = [{}];
		expect(computePlan().attachBalanceHandoff).toBeUndefined();
	});

	test("keeps one-off prepaid carry rows on their existing attach path", () => {
		state.oneOffPrepaidRows = [{}];
		expect(computePlan().attachBalanceHandoff).toBeUndefined();
	});

	test("keeps existing rollovers on their existing attach path", () => {
		const sourceWithRollover = structuredClone(sourceCustomerProduct);
		sourceWithRollover.customer_entitlements[0]!.rollovers = [
			{ id: "rollover_1" } as never,
		];
		const context = buildAttachContext({
			entityId: "canonical_entity",
			internalEntityId: "internal_entity",
		});
		context.carryOverSourceCustomerProduct = sourceWithRollover;
		expect(
			computeAttachPlan({
				ctx: {} as never,
				attachBillingContext: context,
				params,
			}).attachBalanceHandoff,
		).toBeUndefined();
	});
});
