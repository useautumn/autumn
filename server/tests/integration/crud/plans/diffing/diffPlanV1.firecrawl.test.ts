import { describe, expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import {
	applyDiff,
	type ApplyDiffOutput,
} from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import {
	growthBase,
	growthVariants,
	hobbyBase,
	hobbyVariants,
	scaleTier1Base,
	scaleVariants,
	standardBase,
	standardVariants,
} from "./diffPlanV1.firecrawl.fixtures.js";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import { normalizePlan } from "./utils/normalizePlan.js";

// --- test matrix ---
const groups = [
	{ name: "scale", base: scaleTier1Base, variants: scaleVariants },
	{ name: "hobby", base: hobbyBase, variants: hobbyVariants },
	{ name: "standard", base: standardBase, variants: standardVariants },
	{ name: "growth", base: growthBase, variants: growthVariants },
];

for (const { name, base, variants } of groups) {
	describe(`firecrawl ${name} group — diff/apply round-trip`, () => {
		for (const variant of variants) {
			test(`${variant.id} reconstructs from ${base.id} + diff`, () => {
				const diff = diffPlanV1({ from: base, to: variant });
				const reconstructed = applyDiff({ base, diff });
				expect(normalizePlan(reconstructed)).toEqual(normalizePlan(variant));
			});
		}
	});
}

describe("filter precision — same-feature-id siblings", () => {
	test("mutating the priced CREDITS leaves the price-null CREDITS intact", () => {
		const base = growthBase;
		const pricedCredits = base.items.find(
			(i) => i.feature_id === "CREDITS" && i.price != null,
		)!;
		const mutated: ApiPlanV1 = {
			...base,
			items: base.items.map((item) =>
				item === pricedCredits
					? { ...item, included: item.included + 1 }
					: item,
			),
		};

		const diff = diffPlanV1({ from: base, to: mutated });
		const reconstructed = applyDiff({ base, diff });

		const stillHasPriceNullCredits = reconstructed.items.some(
			(i) =>
				i.feature_id === "CREDITS" &&
				i.price == null &&
				i.reset?.interval === "month",
		);
		expect(stillHasPriceNullCredits).toBe(true);

		const mutatedCredits = reconstructed.items.find(
			(i) => i.feature_id === "CREDITS" && i.price != null,
		);
		expect(mutatedCredits?.included).toBe(pricedCredits.included + 1);
	});
});
