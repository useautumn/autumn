/**
 * Every PlanItemFilter field → batch vs per-customer, via computeBatchMigration.
 *
 * Contract:
 *   feature_id [+ interval] [+ interval_count] → batch remove (narrows cadence)
 *   billing_method OR missing feature_id → unsupported_remove_items
 *   matched priced / rollover / entity / pooled entitlement → per-customer
 */

import { describe, expect, test } from "bun:test";
import type { Price } from "@autumn/shared";
import {
	EntInterval,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { fromEntitlement, runLane } from "./runLane.js";

describe("remove_items field → batch lane", () => {
	test("feature_id alone removes the matching free entitlement", () => {
		const result = runLane({
			customize: { remove_items: [{ feature_id: "messages" }] },
			fromEntitlements: [fromEntitlement()],
		});

		expect(result.computable).toBe(true);
		expect(result.removeIds).toEqual(["ent_from"]);
		expect(result.addIds).toEqual([]);
	});

	test("interval + interval_count narrows to that cadence only", () => {
		const monthly = fromEntitlement({ id: "ent_monthly" });
		const quarterly = fromEntitlement({
			id: "ent_quarterly",
			interval_count: 3,
		});
		const result = runLane({
			customize: {
				remove_items: [
					{
						feature_id: "messages",
						interval: ResetInterval.Month,
						interval_count: 3,
					},
				],
			},
			fromEntitlements: [monthly, quarterly],
		});

		expect(result.computable).toBe(true);
		expect(result.removeIds).toEqual(["ent_quarterly"]);
	});

	test("interval_count alone (with feature_id) does not widen to other cadences", () => {
		const monthly = fromEntitlement({ id: "ent_monthly" });
		const quarterly = fromEntitlement({
			id: "ent_quarterly",
			interval_count: 3,
		});
		const result = runLane({
			customize: {
				remove_items: [{ feature_id: "messages", interval_count: 3 }],
			},
			fromEntitlements: [monthly, quarterly],
		});

		expect(result.computable).toBe(true);
		expect(result.removeIds).toEqual(["ent_quarterly"]);
	});

	test("interval: one_off matches a lifetime entitlement", () => {
		const result = runLane({
			customize: {
				remove_items: [
					{ feature_id: "messages", interval: ResetInterval.OneOff },
				],
			},
			fromEntitlements: [
				fromEntitlement({ id: "ent_lifetime", interval: null }),
			],
		});

		expect(result.computable).toBe(true);
		expect(result.removeIds).toEqual(["ent_lifetime"]);
	});

	test("interval: month with feature_id matches the monthly sibling", () => {
		const monthly = fromEntitlement({
			id: "ent_monthly",
			interval: EntInterval.Month,
		});
		const yearly = fromEntitlement({
			id: "ent_yearly",
			interval: EntInterval.Year,
		});
		const result = runLane({
			customize: {
				remove_items: [
					{ feature_id: "messages", interval: ResetInterval.Month },
				],
			},
			fromEntitlements: [monthly, yearly],
		});

		expect(result.computable).toBe(true);
		expect(result.removeIds).toEqual(["ent_monthly"]);
	});
});

describe("remove_items field → per-customer lane", () => {
	test("billing_method is unsupported_remove_items at the op gate", () => {
		const result = runLane({
			customize: {
				remove_items: [{ feature_id: "messages", billing_method: "prepaid" }],
			},
			fromEntitlements: [fromEntitlement()],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("unsupported_remove_items");
	});

	test("a feature-less interval filter is unsupported_remove_items", () => {
		const result = runLane({
			customize: {
				remove_items: [{ interval: ResetInterval.Month }],
			},
			fromEntitlements: [fromEntitlement()],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("unsupported_remove_items");
	});

	test("a feature-less interval_count filter is unsupported_remove_items", () => {
		const result = runLane({
			customize: { remove_items: [{ interval_count: 3 }] },
			fromEntitlements: [fromEntitlement()],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("unsupported_remove_items");
	});

	test("a priced match is priced_remove_item", () => {
		const entitlement = fromEntitlement();
		const price = {
			id: "price_messages",
			entitlement_id: entitlement.id,
			internal_product_id: "prod_pro",
			config: {},
		} as unknown as Price;

		const result = runLane({
			customize: { remove_items: [{ feature_id: "messages" }] },
			fromEntitlements: [entitlement],
			fromPrices: [price],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("priced_remove_item");
	});

	test("a rollover match is rollover_remove_item", () => {
		const result = runLane({
			customize: { remove_items: [{ feature_id: "messages" }] },
			fromEntitlements: [
				fromEntitlement({
					rollover: {
						max: 100,
						duration: RolloverExpiryDurationType.Month,
						length: 1,
					},
				}),
			],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("rollover_remove_item");
	});

	test("an entity-scoped match is entity_scoped_entitlement", () => {
		const result = runLane({
			customize: { remove_items: [{ feature_id: "messages" }] },
			fromEntitlements: [fromEntitlement({ entity_feature_id: "seats" })],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("entity_scoped_entitlement");
	});

	test("a pooled match is pooled_add_item", () => {
		const result = runLane({
			customize: { remove_items: [{ feature_id: "messages" }] },
			fromEntitlements: [fromEntitlement({ pooled: true })],
		});

		expect(result.computable).toBe(false);
		expect(result.codes).toContain("pooled_add_item");
	});
});
