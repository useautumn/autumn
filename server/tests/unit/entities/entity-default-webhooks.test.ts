import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const executeModulePath =
	"@/internal/billing/v2/execute/executeAutumnBillingPlan";
const initProductModulePath =
	"@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
const billingWebhookModulePath =
	"@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
const productsWebhookModulePath =
	"@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
const defaultsModulePath =
	"@/internal/customers/actions/createWithDefaults/setup/setupDefaultProductsContext";
const pooledModulePath =
	"@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";

const realExecute = { ...(await import(executeModulePath)) };
const realInitProduct = { ...(await import(initProductModulePath)) };
const realBillingWebhook = { ...(await import(billingWebhookModulePath)) };
const realProductsWebhook = { ...(await import(productsWebhookModulePath)) };
const realDefaults = { ...(await import(defaultsModulePath)) };
const realPooled = { ...(await import(pooledModulePath)) };

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const pooledEntitlements = [{ id: "cus_ent_pooled" }];
/** The mocks return plain shapes, so the result is read through them. */
type MockedCustomer = {
	customer_products: unknown[];
	pooled_customer_entitlements: unknown[];
};
const hobby = { id: "hobby", name: "Hobby", prices: [] };
const customerProduct = {
	id: "cus_prod_hobby",
	product: hobby,
};

mock.module(executeModulePath, () => ({
	executeAutumnBillingPlan: async (args: Record<string, unknown>) => {
		calls.push({ name: "execute", args });
	},
}));
mock.module(initProductModulePath, () => ({
	initFullCustomerProductFromProduct: () => customerProduct,
}));
mock.module(billingWebhookModulePath, () => ({
	sendBillingUpdatedWebhook: async (args: Record<string, unknown>) => {
		calls.push({ name: "billing.updated", args });
	},
}));
mock.module(productsWebhookModulePath, () => ({
	billingPlanToSendProductsUpdated: async (args: Record<string, unknown>) => {
		calls.push({ name: "customer.products.updated", args });
	},
}));
mock.module(defaultsModulePath, () => ({
	setupDefaultProductsContext: async () => ({
		fullProducts: [hobby],
		paidProducts: [],
		hasPaidProducts: false,
	}),
}));
mock.module(pooledModulePath, () => ({
	applyPooledBalanceCustomerProductTransitions: async (
		args: Record<string, unknown>,
	) => {
		calls.push({ name: "pooled", args });
		return {
			...(args.fullCustomer as Record<string, unknown>),
			customer_products: args.incomingCustomerProducts,
			pooled_customer_entitlements: pooledEntitlements,
		};
	},
}));

const { attachDefaultProductsToEntities } = await import(
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities"
);

afterAll(() => {
	mock.module(executeModulePath, () => realExecute);
	mock.module(initProductModulePath, () => realInitProduct);
	mock.module(billingWebhookModulePath, () => realBillingWebhook);
	mock.module(productsWebhookModulePath, () => realProductsWebhook);
	mock.module(defaultsModulePath, () => realDefaults);
	mock.module(pooledModulePath, () => realPooled);
});

beforeEach(() => {
	calls.length = 0;
});

describe("entity default products", () => {
	test("emits both webhooks and updates the create response state", async () => {
		const entity = { id: "entity_1" };
		const fullCustomer = {
			id: "customer_1",
			internal_id: "internal_customer_1",
			customer_products: [] as (typeof customerProduct)[],
		};
		const ctx = {
			org: { config: { default_applies_to_entities: true } },
		} as AutumnContext;

		const withDefaults = (await attachDefaultProductsToEntities({
			ctx,
			fullCustomer: fullCustomer as never,
			entities: [entity as never],
		})) as unknown as MockedCustomer;

		expect(calls.map(({ name }) => name)).toEqual([
			"execute",
			"pooled",
			"customer.products.updated",
			"billing.updated",
		]);

		const autumnBillingPlan = {
			customerId: "customer_1",
			insertCustomerProducts: [customerProduct],
		};
		const webhookCustomer = {
			id: "customer_1",
			internal_id: "internal_customer_1",
			customer_products: [],
			entity,
		};
		expect(calls[0]?.args.autumnBillingPlan).toEqual(autumnBillingPlan);
		expect(calls[2]?.args).toMatchObject({
			autumnBillingPlan,
			billingContext: { fullCustomer: webhookCustomer },
		});
		expect(calls[3]?.args).toMatchObject({
			autumnBillingPlan,
			originalFullCustomer: webhookCustomer,
		});
		expect(
			(
				calls[3]?.args.originalFullCustomer as {
					customer_products: unknown[];
				}
			).customer_products,
		).toEqual([]);
		expect(fullCustomer.customer_products).toEqual([]);
		expect(withDefaults.customer_products).toEqual([customerProduct]);
		expect(withDefaults.pooled_customer_entitlements).toEqual(
			pooledEntitlements,
		);
		expect(calls[1]?.args).toMatchObject({
			outgoingCustomerProducts: [],
			incomingCustomerProducts: [customerProduct],
		});
	});

	test("runs one pooled transition across every entity's inserts", async () => {
		const fullCustomer = {
			id: "customer_1",
			internal_id: "internal_customer_1",
			customer_products: [] as (typeof customerProduct)[],
		};
		const ctx = {
			org: { config: { default_applies_to_entities: true } },
		} as AutumnContext;

		const withDefaults = (await attachDefaultProductsToEntities({
			ctx,
			fullCustomer: fullCustomer as never,
			entities: [{ id: "entity_1" }, { id: "entity_2" }] as never,
		})) as unknown as MockedCustomer;

		const byName = (name: string) => calls.filter((call) => call.name === name);
		expect(calls.map(({ name }) => name)).toEqual([
			"execute",
			"execute",
			"pooled",
			"customer.products.updated",
			"billing.updated",
			"customer.products.updated",
			"billing.updated",
		]);
		expect(byName("pooled")[0]?.args).toMatchObject({
			incomingCustomerProducts: [customerProduct, customerProduct],
		});
		expect(fullCustomer.customer_products).toEqual([]);
		expect(withDefaults.customer_products).toEqual([
			customerProduct,
			customerProduct,
		]);
		expect(withDefaults.pooled_customer_entitlements).toEqual(
			pooledEntitlements,
		);
	});
});
