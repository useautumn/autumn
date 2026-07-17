import { beforeEach, expect, mock, test } from "bun:test";
import { type AutumnBillingPlan, EntInterval } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { entitlements } from "@tests/utils/fixtures/db/entitlements.js";
import { products } from "@tests/utils/fixtures/db/products.js";

const pooledEntitlement = {
	...entitlements.create({
		id: "entitlement_default_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		interval: EntInterval.Month,
	}),
	pooled: true,
};
const defaultProduct = products.createFull({
	id: "entity_default",
	entitlements: [pooledEntitlement],
});
let executedPlans: AutumnBillingPlan[] = [];

mock.module("@/internal/billing/v2/execute/executeAutumnBillingPlan", () => ({
	executeAutumnBillingPlan: async ({
		autumnBillingPlan,
	}: {
		autumnBillingPlan: AutumnBillingPlan;
	}) => {
		executedPlans.push(autumnBillingPlan);
	},
}));
mock.module(
	"@/internal/customers/actions/createWithDefaults/setup/setupDefaultProductsContext",
	() => ({
		setupDefaultProductsContext: async () => ({
			fullProducts: [defaultProduct],
			paidProducts: [],
			hasPaidProducts: false,
		}),
	}),
);

const { attachDefaultProductsToEntities } = await import(
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js"
);
const { activateFreeDefaultProduct } = await import(
	"@/internal/customers/cusProducts/actions/activateFreeDefaultProduct.js"
);

const createContext = () => {
	const ctx = contexts.create({ features: [pooledEntitlement.feature] });
	ctx.org.config = {
		...ctx.org.config,
		default_applies_to_entities: true,
	};
	return ctx;
};

beforeEach(() => {
	executedPlans = [];
});

test("entity default attachment prepares pooled source entitlements", async () => {
	const entity = entities.create({ id: "entity_one", featureId: "seats" });
	const fullCustomer = customers.create({});
	fullCustomer.id = null;
	fullCustomer.entities = [entity];

	await attachDefaultProductsToEntities({
		ctx: createContext(),
		fullCustomer,
		entities: [entity],
	});

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.customerId).toBe(fullCustomer.internal_id);
	expect(
		executedPlans[0]?.insertCustomerProducts[0]?.customer_entitlements[0]
			?.balance,
	).toBe(0);
	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		expect.objectContaining({
			op: "upsert_source",
			currentCycleContribution: 500,
		}),
	]);
});

test("automatic free default activation prepares its pooled source", async () => {
	const entity = entities.create({ id: "entity_one", featureId: "seats" });
	const fromCustomerProduct = customerProducts.create({
		id: "customer_product_expired",
		productId: "entity_paid",
		internalEntityId: entity.internal_id,
		entityId: entity.id ?? undefined,
	});
	const fullCustomer = customers.create({
		customerProducts: [fromCustomerProduct],
	});
	fullCustomer.id = null;
	fullCustomer.entities = [entity];

	const activated = await activateFreeDefaultProduct({
		ctx: createContext(),
		customerProduct: fromCustomerProduct,
		fullCustomer,
		defaultProduct,
	});

	expect(activated?.customer_entitlements[0]?.balance).toBe(0);
	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0]?.customerId).toBe(fullCustomer.internal_id);
	expect(executedPlans[0]?.pooledBalanceOps).toEqual([
		expect.objectContaining({
			op: "upsert_source",
			currentCycleContribution: 500,
		}),
	]);
});
