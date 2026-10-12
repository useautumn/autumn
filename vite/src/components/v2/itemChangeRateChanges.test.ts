import { expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type PlanItemChangeV0,
} from "@autumn/shared";
import { itemChangeRateChanges } from "./itemChangeRateChanges";

const features = [
	{ id: "gateway", name: "Gateway spend (USD)", type: FeatureType.Metered },
] as Feature[];

const change = ({
	action,
	creditCost,
}: {
	action: PlanItemChangeV0["action"];
	creditCost: number;
}) =>
	({
		action,
		feature_id: "credits",
		item: {
			feature_id: "credits",
			feature_override: {
				credit_schema: [
					{ metered_feature_id: "gateway", credit_cost: creditCost },
				],
			},
		},
	}) as PlanItemChangeV0;

test("a created item diffs its override against the deleted item of the same feature", () => {
	expect(
		itemChangeRateChanges({
			change: change({ action: "created", creditCost: 3 }),
			deleted: [change({ action: "deleted", creditCost: 2 })],
			features,
		}),
	).toEqual([
		{
			key: "feature-gateway",
			label: "Gateway spend (USD)",
			from: "2 credits",
			to: "3 credits",
		},
	]);
});
