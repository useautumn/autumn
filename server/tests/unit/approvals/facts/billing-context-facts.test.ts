import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import { billingContextToCycleAnchorFacts } from "@/internal/approvals/facts/billing/billingContextToCycleAnchorFacts";
import { billingContextToEntityFacts } from "@/internal/approvals/facts/billing/billingContextToEntityFacts";

describe("billing context facts", () => {
	test("a change at the customer level has no entity", () => {
		expect(
			billingContextToEntityFacts({
				billingContext: { fullCustomer: {} } as BillingContext,
			}),
		).toBeNull();
	});

	test("a change on an entity names the entity's feature", () => {
		expect(
			billingContextToEntityFacts({
				billingContext: {
					fullCustomer: { entity: { feature_id: "seats" } },
				} as unknown as BillingContext,
			}),
		).toEqual({ feature_id: "seats" });
	});

	test("an update naming its plan by customer_product_id alone takes that plan's entity", () => {
		expect(
			billingContextToEntityFacts({
				billingContext: {
					fullCustomer: {
						entities: [{ internal_id: "ent_internal", feature_id: "seats" }],
					},
					customerProduct: { internal_entity_id: "ent_internal" },
				} as unknown as BillingContext,
			}),
		).toEqual({ feature_id: "seats" });
	});

	test.each([
		[undefined, "unchanged"],
		["now", "now"],
		[Date.UTC(2026, 1, 1), "custom"],
	] as const)("billing_cycle_anchor %s reads as %s", (anchor, expected) => {
		expect(
			billingContextToCycleAnchorFacts({
				billingContext: {
					requestedBillingCycleAnchor: anchor,
				} as BillingContext,
			}),
		).toBe(expected);
	});
});
