import { expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import { ApiPlanItemV1Schema } from "../../../api/products/items/apiPlanItemV1.js";
import { applyDiff } from "./applyDiff.js";
import type { DiffedCustomizePlanV1 } from "./diffPlanV1.js";

test("applyDiff normalizes add_items into valid API plan item snapshots", () => {
	const base = {
		price: null,
		items: [],
		free_trial: null,
	} as ApiPlanV1;

	const diff = {
		add_items: [
			{
				feature_id: "emails",
				included: 100000,
				price: {
					amount: 0.52,
					interval: "month",
					billing_method: "usage_based",
				},
				rollover: {
					expiry_duration_type: "month",
				},
			},
		],
	} as DiffedCustomizePlanV1;

	const item = applyDiff({ base, diff }).items[0];

	expect(item.price?.max_purchase).toBeNull();
	expect(item.rollover?.max).toBeNull();
	expect(() => ApiPlanItemV1Schema.parse(item)).not.toThrow();
});
