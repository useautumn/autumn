/**
 * A plan item's rate-card override is part of its identity for diffing.
 *
 * Red (current):  itemsEqual ignores feature_override and toCreatePlanItemParams
 *                 drops it, so a customer customization that only changes the
 *                 rate card diffs to "no change" and never reaches the server.
 * Green (after):  overrides compare field by field and travel on add_items.
 *
 * Contract:
 *   O1 itemsEqual: same item, different override credit_cost → not equal
 *   O2 itemsEqual: override present vs absent → not equal
 *   O3 itemsEqual: identical overrides with dimension keys reordered → equal
 *   O4 diffPlanV1: adding an override emits add_items carrying it (+ remove filter)
 *   O5 diffPlanV1: unchanged override → empty diff
 *   O6 applyDiff: applying that diff yields an item carrying the override
 */

import { expect, test } from "bun:test";
import {
	type ApiFeatureOverride,
	type ApiPlanV1,
	AppEnv,
	ResetInterval,
} from "@autumn/shared";
import { applyDiff } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import { itemsEqual } from "@autumn/shared/utils/planV1Utils/diff/comparePlanItems.js";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";

const plan = (overrides: Partial<ApiPlanV1>): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [],
		created_at: 1,
		env: AppEnv.Sandbox,
		archived: false,
		base_variant_id: null,
		config: { ignore_past_due: false },
		metadata: {},
		...overrides,
	}) as ApiPlanV1;

const creditsItem = (feature_override?: ApiFeatureOverride) => ({
	feature_id: "credits",
	included: 1_000,
	unlimited: false,
	reset: { interval: ResetInterval.Month },
	price: null,
	...(feature_override ? { feature_override } : {}),
});

const override = ({
	creditCost,
}: {
	creditCost: number;
}): ApiFeatureOverride => ({
	credit_schema: [
		{
			metered_feature_id: "actions",
			credit_cost: creditCost,
			dimensions: {
				size_large: { match: { size: "large" }, credit_cost: 16 },
				size_xl: { match: { size: "xl" }, credit_cost: 20 },
			},
		},
	],
});

const reorderedOverride = (): ApiFeatureOverride => ({
	credit_schema: [
		{
			metered_feature_id: "actions",
			credit_cost: 2,
			dimensions: {
				size_xl: { match: { size: "xl" }, credit_cost: 20 },
				size_large: { match: { size: "large" }, credit_cost: 16 },
			},
		},
	],
});

test("O1 a different override credit cost makes items unequal", () => {
	expect(
		itemsEqual(
			creditsItem(override({ creditCost: 2 })),
			creditsItem(override({ creditCost: 3 })),
		),
	).toBe(false);
});

test("O2 an override present on one side only makes items unequal", () => {
	expect(
		itemsEqual(creditsItem(), creditsItem(override({ creditCost: 2 }))),
	).toBe(false);
});

test("O3 identical overrides compare equal regardless of dimension key order", () => {
	expect(
		itemsEqual(
			creditsItem(override({ creditCost: 2 })),
			creditsItem(reorderedOverride()),
		),
	).toBe(true);
});

test("O4 adding an override diffs to add_items that carry it", () => {
	const diff = diffPlanV1({
		from: plan({ items: [creditsItem()] }),
		to: plan({ items: [creditsItem(override({ creditCost: 2 }))] }),
	});

	expect(diff.add_items).toHaveLength(1);
	expect(diff.add_items?.[0].feature_override).toEqual(
		override({ creditCost: 2 }),
	);
	expect(diff.remove_items).toEqual([
		{ feature_id: "credits", interval: ResetInterval.Month, interval_count: 1 },
	]);
});

test("O5 an unchanged override is not a change", () => {
	const diff = diffPlanV1({
		from: plan({ items: [creditsItem(override({ creditCost: 2 }))] }),
		to: plan({ items: [creditsItem(reorderedOverride())] }),
	});

	expect(diff).toEqual({});
});

test("O6 applying the diff keeps the override on the resulting item", () => {
	const base = plan({ items: [creditsItem()] });
	const diff = diffPlanV1({
		from: base,
		to: plan({ items: [creditsItem(override({ creditCost: 2 }))] }),
	});

	const applied = applyDiff({ base, diff });

	expect(applied.items).toHaveLength(1);
	expect(applied.items[0].feature_override).toEqual(
		override({ creditCost: 2 }),
	);
});
