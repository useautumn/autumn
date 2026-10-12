import { expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type PlanItemChangeV0,
} from "@autumn/shared";
import { itemChangeRateRows } from "./itemChangeRateChanges";

const features = [
	{ id: "gateway", name: "Gateway spend (USD)", type: FeatureType.Metered },
	{ id: "debt", name: "Gateway debt", type: FeatureType.Metered },
] as Feature[];

const change = ({
	action,
	gateway,
	debt = 1,
	included = 100,
}: {
	action: PlanItemChangeV0["action"];
	gateway: number;
	debt?: number;
	included?: number;
}) =>
	({
		action,
		feature_id: "credits",
		item: {
			feature_id: "credits",
			included,
			unlimited: false,
			reset: { interval: "month" },
			price: null,
			feature_override: {
				credit_schema: [
					{ metered_feature_id: "gateway", credit_cost: gateway },
					{ metered_feature_id: "debt", credit_cost: debt },
				],
			},
		},
	}) as PlanItemChangeV0;

const rowsFor = (itemChanges: PlanItemChangeV0[]) => {
	const { rows, mergedRemoveIndices } = itemChangeRateRows({
		itemChanges,
		features,
	});
	return {
		rows: rows.map(({ updated, changes }) => ({
			updated,
			changes: changes.map(
				({ label, from, to }) => `${label}: ${from} → ${to}`,
			),
		})),
		merged: [...mergedRemoveIndices],
	};
};

test("an item whose rate card alone changed merges into one updated row with a subrow per rate", () => {
	expect(
		rowsFor([
			change({ action: "created", gateway: 3, debt: 2 }),
			change({ action: "deleted", gateway: 2, debt: 1 }),
		]),
	).toEqual({
		rows: [
			{
				updated: true,
				changes: [
					"Gateway spend (USD): 2 credits → 3 credits",
					"Gateway debt: 1 credits → 2 credits",
				],
			},
		],
		merged: [0],
	});
});

test("an item whose included amount also changed keeps the add/remove pair", () => {
	expect(
		rowsFor([
			change({ action: "created", gateway: 3, included: 200 }),
			change({ action: "deleted", gateway: 2 }),
		]),
	).toEqual({
		rows: [
			{
				updated: false,
				changes: ["Gateway spend (USD): 2 credits → 3 credits"],
			},
		],
		merged: [],
	});
});
