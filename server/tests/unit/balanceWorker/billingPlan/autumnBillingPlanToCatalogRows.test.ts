import { describe, expect, test } from "bun:test";
import { autumnBillingPlanToCatalogRows } from "@/internal/balanceWorker/billingPlan/autumnBillingPlanToCatalogRows.js";
import { createCustomerPlan, linkBackPlan } from "./billingPlanFixtures.js";

describe("autumnBillingPlanToCatalogRows", () => {
	test("catalog rows come once each: the product, its entitlement and the entitlement's feature", () => {
		const rows = autumnBillingPlanToCatalogRows({
			autumnBillingPlan: {
				...createCustomerPlan(),
				updateCustomerProducts: linkBackPlan().updateCustomerProducts,
			},
		});
		expect(rows.map(({ table }) => table).sort()).toEqual([
			"entitlements",
			"features",
			"products",
		]);
	});
});
