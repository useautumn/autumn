import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { customPlansDiffToChanges } from "@/internal/customers/exports/customPlans/customPlansDiffToChanges.js";
import {
	customerProductToCustomPlansExportRow,
	failedCustomerToCustomPlansExportRow,
	isCustomerProductInExportScope,
} from "@/internal/customers/exports/customPlans/customPlansExportRow.js";
import { customReasonsToText } from "@/internal/customers/exports/customPlans/customReasonsToText.js";
import type { CustomerExportScalarRow } from "@/internal/customers/exports/queries/getCustomerExportScalars.js";
import {
	basePrice,
	booleanItem,
	catalogPlan,
	customerPlan,
	derive,
	includedItem,
	planLicense,
	prepaidItem,
} from "../cus-products/derive-is-custom/isCustomFixtures";

const scalar: CustomerExportScalarRow = {
	internal_id: "cus_internal",
	id: "cus_123",
	name: "Customer",
	email: "user@example.com",
	processor: null,
};

const onPlan = ({
	version = 3,
	isCustom = false,
}: {
	version?: number;
	isCustom?: boolean;
} = {}) => {
	const customerProduct = customerPlan({ items: [includedItem()] });
	return {
		...customerProduct,
		is_custom: isCustom,
		product: { ...customerProduct.product, id: "pro_yearly", version },
	};
};

describe("isCustomerProductInExportScope", () => {
	test("no plan filter → every customer product is in scope", () => {
		expect(
			isCustomerProductInExportScope({
				customerProduct: onPlan(),
				filters: {},
			}),
		).toBe(true);
	});

	test.each([
		{ filter: "pro_yearly:3", plan: onPlan({ version: 3 }), inScope: true },
		{ filter: "pro_yearly:2", plan: onPlan({ version: 3 }), inScope: false },
		{ filter: "pro_quarterly:3", plan: onPlan({ version: 3 }), inScope: false },
		{
			filter: "pro_yearly:custom",
			plan: onPlan({ isCustom: true }),
			inScope: true,
		},
		{
			filter: "pro_yearly:custom",
			plan: onPlan({ isCustom: false }),
			inScope: false,
		},
	])(
		"$filter scopes plan $plan.product.version (custom: $plan.is_custom) → $inScope",
		({ filter, plan, inScope }) => {
			expect(
				isCustomerProductInExportScope({
					customerProduct: plan,
					filters: { version: [filter] },
				}),
			).toBe(inScope);
		},
	);

	test("matching any of several plan filters is enough", () => {
		expect(
			isCustomerProductInExportScope({
				customerProduct: onPlan({ version: 3 }),
				filters: { version: ["pro_quarterly:1", "pro_yearly:3"] },
			}),
		).toBe(true);
	});
});

describe("customerProductToCustomPlansExportRow", () => {
	const rowFor = ({
		customer,
		catalog,
		isCustom,
	}: {
		customer: Parameters<typeof customerPlan>[0];
		catalog: Parameters<typeof catalogPlan>[0];
		isCustom: boolean;
	}) => {
		const customerProduct = {
			...customerPlan(customer),
			is_custom: isCustom,
			status: CusProductStatus.Active,
		};
		return customerProductToCustomPlansExportRow({
			scalar,
			fullCustomer: { entities: [] } as never,
			customerProduct,
			result: derive({
				customer: customerProduct,
				catalog: catalogPlan(catalog),
			}),
			applied: null,
		});
	};

	test("a plan matching its catalog → no diff", () => {
		const plan = { items: [includedItem()], prices: [basePrice()] };

		expect(rowFor({ customer: plan, catalog: plan, isCustom: true })).toEqual({
			customer_id: "cus_123",
			name: "Customer",
			email: "user@example.com",
			entity_id: null,
			customer_product_id: "cus_prod_1",
			plan_id: "pro",
			plan_version: "3",
			status: "active",
			applied: null,
			outcome: "matches_catalog",
			reasons: null,
			changes: null,
			diff: null,
		});
	});

	test("a really custom plan carries the diff", () => {
		const row = rowFor({
			customer: { prices: [basePrice({ amount: 39 })] },
			catalog: { prices: [basePrice({ amount: 49 })] },
			isCustom: true,
		});

		expect(row).toMatchObject({
			outcome: "customized",
			reasons: "price_changed",
			changes: "base price: amount 49 → 39",
		});
		expect(JSON.parse(row.diff ?? "null")).toEqual({
			price: {
				catalog: { amount: 49, interval: "month" },
				customer: { amount: 39, interval: "month" },
			},
		});
	});

	test("an entity plan keeps its entity id even when getFull capped the entities", () => {
		const customerProduct = {
			...customerPlan({ items: [includedItem()] }),
			entity_id: "ent_42",
			internal_entity_id: "internal_ent_42",
		};
		const row = customerProductToCustomPlansExportRow({
			scalar,
			fullCustomer: { entities: [] } as never,
			customerProduct,
			result: derive({
				customer: customerProduct,
				catalog: catalogPlan({ items: [includedItem()] }),
			}),
			applied: null,
		});

		expect(row.entity_id).toBe("ent_42");
	});

	test("a failed read still yields a row naming the customer", () => {
		expect(
			failedCustomerToCustomPlansExportRow({
				scalar,
				error: new Error("timed out"),
			}),
		).toMatchObject({
			customer_id: "cus_123",
			outcome: "export_failed",
			reasons: null,
			changes: "timed out",
			customer_product_id: null,
		});
	});
});

describe("customPlansDiffToChanges", () => {
	const changesOf = ({
		customer,
		catalog,
	}: {
		customer: Parameters<typeof customerPlan>[0];
		catalog: Parameters<typeof catalogPlan>[0];
	}) => {
		const result = derive({
			customer: customerPlan(customer),
			catalog: catalogPlan(catalog),
		});
		if (result.outcome !== "customized") throw new Error(result.outcome);
		return customPlansDiffToChanges({ diff: result.diff });
	};

	test("an edited item lists each moved term, catalog value first", () => {
		expect(
			changesOf({
				catalog: { items: [prepaidItem({ amount: 10, billingUnits: 100 })] },
				customer: { items: [prepaidItem({ amount: 8, billingUnits: 1_000 })] },
			}),
		).toBe("credits: price.amount 10 → 8, price.billing_units 100 → 1000");
	});

	test("added and removed items are named as such", () => {
		expect(
			changesOf({
				catalog: { items: [includedItem()] },
				customer: { items: [booleanItem()] },
			}),
		).toBe("credits: removed; sso: added");
	});

	test("a paid plan the customer gets free reads as a removed base price", () => {
		expect(
			changesOf({
				catalog: { prices: [basePrice()] },
				customer: { prices: [] },
			}),
		).toBe("base price: removed");
	});

	test("license changes carry the customer's terms", () => {
		expect(
			changesOf({
				catalog: { licenses: [planLicense({ included: 2 })] },
				customer: { licenses: [planLicense({ included: 20 })] },
			}),
		).toBe(
			'license seat_plan: included 20, prepaid_only true, version_slug "v1"',
		);
	});
});

describe("customReasonsToText", () => {
	test("each reason is one clause naming what it's about", () => {
		expect(
			customReasonsToText({
				reasons: [
					{ kind: "price_changed" },
					{ kind: "item_removed", feature_id: "dashboard" },
					{ kind: "license_added", license_plan_id: "seat_plan" },
				],
			}),
		).toBe("price_changed; item_removed:dashboard; license_added:seat_plan");
	});
});
