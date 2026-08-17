import { expect, test } from "bun:test";
import { type ProductItem, TierBehavior, TierInfinite } from "@autumn/shared";
import { prepaidTierStops } from "./prepaidQuantityUtils";

type TierStopItem = Pick<
	ProductItem,
	"tiers" | "tier_behavior" | "included_usage"
>;
type PriceTier = NonNullable<ProductItem["tiers"]>[number];

const tier = ({
	to,
	flatAmount,
}: {
	to: number | typeof TierInfinite;
	flatAmount?: number;
}): PriceTier => ({ to, amount: 0, flat_amount: flatAmount });

const volumeItem = ({
	tiers,
	includedUsage = 0,
}: {
	tiers: PriceTier[];
	includedUsage?: number;
}): TierStopItem => ({
	tiers,
	tier_behavior: TierBehavior.VolumeBased,
	included_usage: includedUsage,
});

test("returns each finite tier bound in ascending order", () => {
	const item = volumeItem({
		tiers: [tier({ to: 100 }), tier({ to: 500 }), tier({ to: TierInfinite })],
	});

	expect(prepaidTierStops({ item })).toEqual([100, 500]);
});

test("shifts bounds by included usage to match the displayed quantity", () => {
	const item = volumeItem({
		tiers: [tier({ to: 100 }), tier({ to: 500 }), tier({ to: TierInfinite })],
		includedUsage: 50,
	});

	expect(prepaidTierStops({ item })).toEqual([150, 550]);
});

test("returns no stops for graduated tiers", () => {
	const item: TierStopItem = {
		tiers: [tier({ to: 100 }), tier({ to: TierInfinite })],
		tier_behavior: TierBehavior.Graduated,
		included_usage: 0,
	};

	expect(prepaidTierStops({ item })).toEqual([]);
});

test("returns no stops when tier behavior is unset", () => {
	const item: TierStopItem = {
		tiers: [tier({ to: 100 }), tier({ to: TierInfinite })],
		tier_behavior: null,
		included_usage: 0,
	};

	expect(prepaidTierStops({ item })).toEqual([]);
});

test("returns no stops when there is nothing to cycle through", () => {
	expect(
		prepaidTierStops({
			item: volumeItem({ tiers: [tier({ to: TierInfinite })] }),
		}),
	).toEqual([]);
	expect(
		prepaidTierStops({ item: volumeItem({ tiers: [tier({ to: 100 })] }) }),
	).toEqual([]);
});

test("handles volume packages priced by flat amount", () => {
	const item = volumeItem({
		tiers: [
			tier({ to: 100, flatAmount: 50 }),
			tier({ to: 500, flatAmount: 200 }),
			tier({ to: 1000, flatAmount: 350 }),
		],
	});

	expect(prepaidTierStops({ item })).toEqual([100, 500, 1000]);
});

test("dedupes, sorts, and drops bounds at or below included usage", () => {
	const item = volumeItem({
		tiers: [tier({ to: 500 }), tier({ to: 100 }), tier({ to: 100 })],
		includedUsage: 100,
	});

	expect(prepaidTierStops({ item })).toEqual([200, 600]);
});
