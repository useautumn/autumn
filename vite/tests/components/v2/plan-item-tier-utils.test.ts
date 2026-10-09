import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";
import {
	itemToTierRows,
	itemToVolumeTierRule,
} from "@/components/v2/planItemTierUtils";

const tieredItem = ({
	tierBehavior,
	tiers = [
		{ to: 100, amount: 1 },
		{ to: Infinite, amount: 0.5 },
	],
}: {
	tierBehavior: TierBehavior;
	tiers?: PriceTier[];
}): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		tier_behavior: tierBehavior,
		tiers,
	}) as ProductItem;

describe("itemToTierRows", () => {
	test("graduated keeps the included row", () => {
		expect(
			itemToTierRows({
				item: tieredItem({ tierBehavior: TierBehavior.Graduated }),
				currency: "usd",
			}),
		).toEqual([
			{ range: "0–100", value: "Included" },
			{ range: "100–200", value: "$1" },
			{ range: "200+", value: "$0.5" },
		]);
	});

	test("volume marks the included usage as free only until exceeded", () => {
		const rows = itemToTierRows({
			item: tieredItem({ tierBehavior: TierBehavior.VolumeBased }),
			currency: "usd",
		});
		expect(rows[0]).toEqual({ range: "0–100", value: "Free until exceeded" });
	});

	test("mixed tiers show both the rate and the flat fee", () => {
		const rows = itemToTierRows({
			item: tieredItem({
				tierBehavior: TierBehavior.VolumeBased,
				tiers: [
					{ to: 100, amount: 1, flat_amount: 5 },
					{ to: Infinite, amount: 0.5 },
				],
			}),
			currency: "usd",
		});
		expect(rows[1]).toEqual({ range: "100–200", value: "$1 + $5 flat" });
	});
});

describe("itemToVolumeTierRule", () => {
	test("volume items carry the rule with the included threshold", () => {
		expect(
			itemToVolumeTierRule({
				item: tieredItem({ tierBehavior: TierBehavior.VolumeBased }),
			}),
		).toBe("volume: past 100, all units at the reached tier's rate");
	});

	test("graduated items have no volume rule", () => {
		expect(
			itemToVolumeTierRule({
				item: tieredItem({ tierBehavior: TierBehavior.Graduated }),
			}),
		).toBeUndefined();
	});
});
