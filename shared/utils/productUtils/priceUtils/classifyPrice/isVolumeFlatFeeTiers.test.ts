import { describe, expect, test } from "bun:test";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { isVolumeFlatFeeTiers } from "./isVolumeFlatFeeTiers";

describe("isVolumeFlatFeeTiers", () => {
	test("flat-only volume tiers are flat fee", () => {
		const tiers = [
			{ to: 100, amount: 0, flat_amount: 10 },
			{ to: "inf", amount: 0, flat_amount: 25 },
		];
		expect(
			isVolumeFlatFeeTiers({ tierBehavior: TierBehavior.VolumeBased, tiers }),
		).toBe(true);
	});

	test("V1 tiers with no amount and a flat fee are flat fee", () => {
		const tiers = [{ flat_amount: 10 }, { flat_amount: 25 }];
		expect(isVolumeFlatFeeTiers({ tierBehavior: "volume", tiers })).toBe(true);
	});

	test("mixed per-unit and flat tiers are not flat fee", () => {
		const tiers = [
			{ to: 100, amount: 1, flat_amount: 10 },
			{ to: "inf", amount: 0.5, flat_amount: 0 },
		];
		expect(
			isVolumeFlatFeeTiers({ tierBehavior: TierBehavior.VolumeBased, tiers }),
		).toBe(false);
	});

	test("volume tiers without any flat fee are not flat fee", () => {
		const tiers = [
			{ to: 100, amount: 0, flat_amount: 0 },
			{ to: "inf", amount: 0 },
		];
		expect(
			isVolumeFlatFeeTiers({ tierBehavior: TierBehavior.VolumeBased, tiers }),
		).toBe(false);
	});

	test("graduated tiers are never flat fee", () => {
		const tiers = [
			{ to: 100, amount: 0, flat_amount: 10 },
			{ to: "inf", amount: 0, flat_amount: 25 },
		];
		expect(
			isVolumeFlatFeeTiers({ tierBehavior: TierBehavior.Graduated, tiers }),
		).toBe(false);
		expect(isVolumeFlatFeeTiers({ tierBehavior: undefined, tiers })).toBe(
			false,
		);
	});
});
