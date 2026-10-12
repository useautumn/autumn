import { describe, expect, test } from "bun:test";
import type { UpdatePlanOp } from "@autumn/shared";
import type { AddItem, RemoveFilter } from "./addItemRateChanges";
import {
	withEditedAddItem,
	withEditedRemoveFilter,
} from "./editMigrationItems";

const override = (cost: number) => ({
	credit_schema: [{ metered_feature_id: "gateway", credit_cost: cost }],
});

const credits = (patch: Partial<AddItem> = {}): AddItem => ({
	feature_id: "credits",
	included: 100,
	unlimited: false,
	reset: { interval: "month" },
	feature_override: override(3),
	...patch,
});

const stampedFilter: RemoveFilter = {
	feature_id: "credits",
	interval: "month",
	interval_count: 1,
	included: 100,
	previous_feature_override: override(2),
	only_feature_override_changed: true,
};

const customize = {
	add_items: [credits()],
	remove_items: [stampedFilter],
} as NonNullable<UpdatePlanOp["customize"]>;

const editedFilter = (item: AddItem) =>
	withEditedAddItem({ customize, addIndex: 0, item }).remove_items?.[0];

describe("withEditedAddItem", () => {
	test.each([
		["included", credits({ included: 200 })],
		[
			"price",
			credits({ price: { amount: 10, interval: "month" } } as Partial<AddItem>),
		],
		["reset", credits({ reset: { interval: "month", interval_count: 3 } })],
	])("editing %s brings the Add/Remove pair back", (_, item) => {
		const filter = editedFilter(item);
		expect(filter?.only_feature_override_changed).toBeUndefined();
		expect(filter?.previous_feature_override).toEqual(override(2));
	});

	test("editing only the override keeps the row merged", () => {
		expect(
			editedFilter(credits({ feature_override: override(5) }))
				?.only_feature_override_changed,
		).toBe(true);
	});

	test("an edit from the item editor keeps the override it can't show", () => {
		const { feature_override: _dropped, ...withoutOverride } = credits();
		const result = withEditedAddItem({
			customize,
			addIndex: 0,
			item: withoutOverride as AddItem,
		});
		expect(result.add_items?.[0].feature_override).toEqual(override(3));
		expect(result.remove_items?.[0].only_feature_override_changed).toBe(true);
	});
});

describe("withEditedRemoveFilter", () => {
	test("a filter edited to match other items drops its display stamps", () => {
		expect(
			withEditedRemoveFilter({
				previous: stampedFilter,
				next: { ...stampedFilter, included: 500 },
			}),
		).toEqual({
			feature_id: "credits",
			interval: "month",
			interval_count: 1,
			included: 500,
		});
	});

	test("an unchanged filter keeps them", () => {
		expect(
			withEditedRemoveFilter({ previous: stampedFilter, next: stampedFilter }),
		).toEqual(stampedFilter);
	});
});
