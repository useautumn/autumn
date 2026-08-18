import { beforeEach, describe, expect, test } from "bun:test";
import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type ProductsUpdatedArgs = {
	internalCustomerId: string;
	org: { id: string };
	customerId: string;
	scenario: AttachScenario;
	cusProduct: FullCusProduct;
};

type BillingUpdatedArgs = {
	originalFullCustomer: FullCustomer;
	updateCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Record<string, unknown>;
	}[];
};

type Emission =
	| { name: "products_updated"; args: ProductsUpdatedArgs }
	| { name: "billing.updated"; args: BillingUpdatedArgs };

const emissions: Emission[] = [];

await mockModuleWithRestore(
	"@/internal/analytics/handlers/handleProductsUpdated.js",
	() => ({
		addProductsUpdatedWebhookTask: (args: ProductsUpdatedArgs) => {
			emissions.push({ name: "products_updated", args });
			return Promise.resolve();
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated.js",
	() => ({
		emitCustomerProductBillingUpdated: (args: BillingUpdatedArgs) => {
			emissions.push({ name: "billing.updated", args });
		},
	}),
);

const { renewCustomerProduct } = await import(
	"@/internal/customers/cusProducts/actions/renewCustomerProduct.js"
);

const customerProduct = {
	id: "cus_prod_renew_1",
	internal_customer_id: "internal_cus_1",
	product: { id: "pro", name: "Pro" },
} as unknown as FullCusProduct;

const buildContext = () =>
	({
		org: { id: "org_1", slug: "acme" },
		env: "production",
		logger: { debug: () => {}, info: () => {}, error: () => {} },
	}) as unknown as AutumnContext;

const buildFullCustomer = () =>
	({
		id: "customer_1",
		internal_id: "internal_cus_1",
		customer_products: [customerProduct],
	}) as unknown as FullCustomer;

const findEmission = <TName extends Emission["name"]>(name: TName) =>
	emissions.find(
		(emission): emission is Extract<Emission, { name: TName }> =>
			emission.name === name,
	);

describe("renewCustomerProduct", () => {
	beforeEach(() => {
		emissions.length = 0;
	});

	test("enqueues the products_updated task with the Renew scenario", async () => {
		await renewCustomerProduct({
			ctx: buildContext(),
			customerProduct,
			fullCustomer: buildFullCustomer(),
		});

		const productsUpdated = findEmission("products_updated");

		expect(productsUpdated).toBeDefined();
		expect(productsUpdated?.args.scenario).toBe(AttachScenario.Renew);
		expect(productsUpdated?.args.cusProduct.id).toBe("cus_prod_renew_1");
		expect(productsUpdated?.args.internalCustomerId).toBe("internal_cus_1");
		expect(productsUpdated?.args.customerId).toBe("customer_1");
		expect(productsUpdated?.args.org.id).toBe("org_1");
	});

	test("emits billing.updated for the customer product with empty updates", async () => {
		await renewCustomerProduct({
			ctx: buildContext(),
			customerProduct,
			fullCustomer: buildFullCustomer(),
		});

		const billingUpdated = findEmission("billing.updated");

		expect(billingUpdated).toBeDefined();
		expect(billingUpdated?.args.originalFullCustomer.id).toBe("customer_1");
		expect(billingUpdated?.args.updateCustomerProducts).toHaveLength(1);
		expect(
			billingUpdated?.args.updateCustomerProducts[0].customerProduct.id,
		).toBe("cus_prod_renew_1");
		expect(billingUpdated?.args.updateCustomerProducts[0].updates).toEqual({});
	});

	test("enqueues products_updated before emitting billing.updated", async () => {
		await renewCustomerProduct({
			ctx: buildContext(),
			customerProduct,
			fullCustomer: buildFullCustomer(),
		});

		expect(emissions.map((emission) => emission.name)).toEqual([
			"products_updated",
			"billing.updated",
		]);
	});
});
