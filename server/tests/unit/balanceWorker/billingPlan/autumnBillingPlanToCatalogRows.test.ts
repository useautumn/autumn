import { describe, expect, test } from "bun:test";
import { FreeTrialDuration } from "@autumn/shared";
import { autumnBillingPlanToCatalogRows } from "@/internal/balanceWorker/billingPlan/autumnBillingPlanToCatalogRows.js";
import {
	createCustomerPlan,
	linkBackPlan,
	product,
} from "./billingPlanFixtures.js";

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

describe("autumnBillingPlanToCatalogRows: free trials", () => {
	test("a product's free trial rides along, scoped by the product's org and env", () => {
		const trialing = product({ id: "cp_trial" });
		trialing.free_trial_id = "ft_1";
		trialing.free_trial = {
			id: "ft_1",
			created_at: 1,
			internal_product_id: trialing.internal_product_id,
			duration: FreeTrialDuration.Day,
			length: 7,
			unique_fingerprint: false,
			is_custom: false,
			card_required: true,
			on_end: "revert",
		};
		const rows = autumnBillingPlanToCatalogRows({
			autumnBillingPlan: {
				customerId: "cus_test",
				insertCustomerProducts: [trialing, product({ id: "cp_plain" })],
			},
		});
		expect(
			rows.flatMap((row) => (row.table === "freeTrials" ? [row.row] : [])),
		).toEqual([
			{
				...trialing.free_trial,
				org_id: trialing.product.org_id,
				env: trialing.product.env,
			},
		]);
	});
});
