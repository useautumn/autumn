import { describe, expect, test } from "bun:test";
import type { InsertCustomerEntitlement } from "@autumn/shared";
import { insertCustomerEntitlementsToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerEntitlements/insertCustomerEntitlementsToPlanOps.js";
import { minimalLooseGrant, planOf } from "../../billingPlanFixtures.js";

const rowsFor = (insertCustomerEntitlements: InsertCustomerEntitlement[]) =>
	insertCustomerEntitlementsToPlanOps({
		autumnBillingPlan: planOf({ insertCustomerEntitlements }),
	}).map((op) => {
		if (op.op !== "insert" || op.table !== "customerEntitlements")
			throw new Error("expected a grant insert");
		return op.row;
	});

describe("insertCustomerEntitlementsToPlanOps", () => {
	test("a plan with no loose grants inserts none", () => {
		expect(
			insertCustomerEntitlementsToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
		expect(rowsFor([])).toEqual([]);
	});

	test("columns the insert leaves out are stored as their table defaults", () => {
		expect(rowsFor([minimalLooseGrant()])).toEqual([
			{
				...minimalLooseGrant(),
				balance: 0,
				adjustment: 0,
				additional_balance: 0,
				separate_interval: false,
				usage_allowed: false,
				customer_product_id: null,
				internal_entity_id: null,
				next_reset_at: null,
				expires_at: null,
				external_id: null,
			},
		]);
	});

	test("columns the insert names are kept as given", () => {
		const named = {
			...minimalLooseGrant(),
			balance: 5,
			adjustment: 2,
			additional_balance: 3,
			separate_interval: true,
			usage_allowed: true,
			customer_product_id: "cp_1",
			internal_entity_id: "internal_ent_1",
			next_reset_at: 1_800_000_000_000,
			expires_at: 1_900_000_000_000,
			external_id: "topup_1",
		};
		expect(rowsFor([named])).toEqual([named]);
	});

	test("each loose grant is its own insert, in order", () => {
		expect(
			rowsFor([
				minimalLooseGrant(),
				{ ...minimalLooseGrant(), id: "grant_loose_2" },
			]).map(({ id }) => id),
		).toEqual(["grant_loose", "grant_loose_2"]);
	});
});
