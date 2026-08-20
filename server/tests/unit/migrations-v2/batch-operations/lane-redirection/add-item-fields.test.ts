/**
 * Every CreatePlanItemParamsV1 field → batch vs per-customer, via
 * computeBatchMigration (the real redirection gate).
 *
 * Contract:
 *   feature_id / included / unlimited / reset → batch add
 *   price (any nested field) → priced_add_item
 *   proration alone → batch (no Stripe write without price)
 *   entity_feature_id → entity_scoped_entitlement
 *   pooled → pooled_add_item
 *   rollover on a new add → batch (definition only; no accrued rows)
 *   entitlement_id / price_id → identity, do not redirect
 */

import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import type { CreatePlanItemParamsV1Input } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import {
	creditsFeature,
	dashboardFeature,
	entitlementRow,
	fromEntitlement,
	runLane,
} from "./runLane.js";

const monthlyMessages = (
	overrides: Partial<CreatePlanItemParamsV1Input> = {},
): CreatePlanItemParamsV1Input => ({
	feature_id: "messages",
	included: 100,
	reset: { interval: ResetInterval.Month, interval_count: 1 },
	...overrides,
});

describe("add_items field → batch lane", () => {
	test("feature_id + included + monthly reset lowers to an add", () => {
		const item = monthlyMessages();
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [{ item, entitlement: entitlementRow() }],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
		expect(result.replaceToIds).toEqual([]);
	});

	test("add_items for a feature already on fromProduct still lowers to an add", () => {
		const item = monthlyMessages({ included: 60 });
		const result = runLane({
			customize: { add_items: [item] },
			fromEntitlements: [fromEntitlement({ allowance: 60 })],
			preparedAdds: [
				{ item, entitlement: entitlementRow({ id: "ent_new", allowance: 60 }) },
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});

	test("included: 0 is still a free add", () => {
		const item = monthlyMessages({ included: 0 });
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [{ item, entitlement: entitlementRow({ allowance: 0 }) }],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});

	test("unlimited lowers to an add with no tracked balance", () => {
		const item = monthlyMessages({ included: undefined, unlimited: true });
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({
						allowance_type: AllowanceType.Unlimited,
						allowance: null,
					}),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});

	test("reset.interval_count: 3 is a free quarterly add", () => {
		const item = monthlyMessages({
			reset: { interval: ResetInterval.Month, interval_count: 3 },
		});
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{ item, entitlement: entitlementRow({ interval_count: 3 }) },
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});

	test("a boolean feature (no reset) lowers to an add", () => {
		const item = { feature_id: "dashboard" };
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({
						id: "ent_dashboard",
						feature: dashboardFeature,
					}),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_dashboard"]);
	});

	test("a free credit-system feature lowers to an add", () => {
		const item = {
			feature_id: "credits",
			included: 50,
			reset: { interval: ResetInterval.Month },
		};
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({
						id: "ent_credits",
						feature: creditsFeature,
						allowance: 50,
					}),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_credits"]);
	});

	test("a lifetime / one_off reset lowers to an add", () => {
		const item = {
			feature_id: "messages",
			included: 100,
			reset: { interval: ResetInterval.OneOff },
		};
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({
						interval: null,
						interval_count: 1,
					}),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});

	test("proration without a price does not leave the batch lane", () => {
		const item = monthlyMessages({
			proration: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.ProrateImmediately,
			},
		});
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [{ item, entitlement: entitlementRow() }],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});

	test("entitlement_id / price_id are identity and stay in the batch lane", () => {
		const item = monthlyMessages({
			entitlement_id: "ent_preserved",
			price_id: "price_unused",
		});
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({ id: "ent_preserved" }),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_preserved"]);
	});

	test("a new rollover definition (no accrued rows) stays in the batch lane", () => {
		const item = monthlyMessages({
			rollover: {
				max: 100,
				expiry_duration_type: RolloverExpiryDurationType.Month,
				expiry_duration_length: 1,
			},
		});
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({
						rollover: {
							max: 100,
							duration: RolloverExpiryDurationType.Month,
							length: 1,
						},
					}),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.addIds).toEqual(["ent_new"]);
	});
});

describe("add_items field → per-customer lane", () => {
	test("price (amount) is priced_add_item at the op gate", () => {
		const result = runLane({
			customize: {
				add_items: [
					monthlyMessages({
						price: {
							amount: 10,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.UsageBased,
							billing_units: 1,
						},
					}),
				],
			},
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("priced_add_item");
	});

	test("price (tiers) is priced_add_item at the op gate", () => {
		const result = runLane({
			customize: {
				add_items: [
					monthlyMessages({
						price: {
							tiers: [{ to: "inf", amount: 5 }],
							interval: BillingInterval.Month,
							billing_method: BillingMethod.UsageBased,
							billing_units: 100,
						},
					}),
				],
			},
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("priced_add_item");
	});

	test("proration riding a prepaid price is still priced_add_item", () => {
		const result = runLane({
			customize: {
				add_items: [
					monthlyMessages({
						price: {
							amount: 20,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.Prepaid,
							billing_units: 1,
						},
						proration: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					}),
				],
			},
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("priced_add_item");
	});

	test("entity_feature_id is entity_scoped_entitlement", () => {
		const item = monthlyMessages({ entity_feature_id: "seats" });
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({ entity_feature_id: "seats" }),
				},
			],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("entity_scoped_entitlement");
	});

	test("pooled: true is pooled_add_item — set-based insert never reaches the anchor", () => {
		const item = monthlyMessages({ pooled: true });
		const result = runLane({
			customize: { add_items: [item] },
			preparedAdds: [{ item, entitlement: entitlementRow({ pooled: true }) }],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("pooled_add_item");
	});

	test("one pooled add next to a free add still rejects the whole migration", () => {
		const free = monthlyMessages();
		const pooled = {
			feature_id: "credits",
			included: 50,
			reset: { interval: ResetInterval.Month },
			pooled: true,
		};
		const result = runLane({
			customize: { add_items: [free, pooled] },
			preparedAdds: [
				{ item: free, entitlement: entitlementRow() },
				{
					item: pooled,
					entitlement: entitlementRow({
						id: "ent_credits",
						feature: creditsFeature,
						allowance: 50,
						pooled: true,
					}),
				},
			],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("pooled_add_item");
	});
});

describe("add_items + remove_items (replace) through the same gate", () => {
	test("a free allowance edit lowers to a replace, not add+remove", () => {
		const item = monthlyMessages({ included: 200 });
		const result = runLane({
			customize: {
				add_items: [item],
				remove_items: [{ feature_id: "messages" }],
			},
			fromEntitlements: [fromEntitlement()],
			preparedAdds: [
				{
					item,
					entitlement: entitlementRow({
						id: "ent_new",
						allowance: 200,
					}),
				},
			],
		});

		expect(result.computable).toBe(true);
		expect(result.replaceFromIds).toEqual(["ent_from"]);
		expect(result.replaceToIds).toEqual(["ent_new"]);
		expect(result.addIds).toEqual([]);
		expect(result.removeIds).toEqual([]);
	});
});
