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

const realExecute = { ...(await import(executeModulePath)) };
const realInitProduct = { ...(await import(initProductModulePath)) };
const realBillingWebhook = { ...(await import(billingWebhookModulePath)) };
const realProductsWebhook = { ...(await import(productsWebhookModulePath)) };
const realDefaults = { ...(await import(defaultsModulePath)) };

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
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

const { attachDefaultProductsToEntities } = await import(
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities"
);

afterAll(() => {
	mock.module(executeModulePath, () => realExecute);
	mock.module(initProductModulePath, () => realInitProduct);
	mock.module(billingWebhookModulePath, () => realBillingWebhook);
	mock.module(productsWebhookModulePath, () => realProductsWebhook);
	mock.module(defaultsModulePath, () => realDefaults);
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

		await attachDefaultProductsToEntities({
			ctx,
			fullCustomer: fullCustomer as never,
			entities: [entity as never],
		});

		expect(calls.map(({ name }) => name)).toEqual([
			"execute",
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
		expect(calls[1]?.args).toMatchObject({
			autumnBillingPlan,
			billingContext: { fullCustomer: webhookCustomer },
		});
		expect(calls[2]?.args).toMatchObject({
			autumnBillingPlan,
			originalFullCustomer: webhookCustomer,
		});
		expect(
			(
				calls[2]?.args.originalFullCustomer as {
					customer_products: unknown[];
				}
			).customer_products,
		).toEqual([]);
		expect(fullCustomer.customer_products).toEqual([customerProduct]);
	});
});
