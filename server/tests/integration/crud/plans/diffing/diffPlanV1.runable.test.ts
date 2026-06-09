import { type ApiPlanV1 } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import { applyDiff } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import {
	creditPackBase,
	creditPackVariants,
	plusBase,
	plusVariants,
	proBase,
	proVariants,
	unlimitedBase,
	unlimitedVariants,
	freeStarterBase,
	freeStarterVariants,
	maxBase,
	maxVariants,
} from "./diffPlanV1.runable.fixtures.js";
import { normalizePlan } from "./utils/normalizePlan.js";

// --- test matrix ---
const groups = [
	{ name: "credit_pack", base: creditPackBase, variants: creditPackVariants },
	{ name: "plus", base: plusBase, variants: plusVariants },
	{ name: "pro", base: proBase, variants: proVariants },
	{ name: "unlimited", base: unlimitedBase, variants: unlimitedVariants },
	{ name: "free_starter", base: freeStarterBase, variants: freeStarterVariants },
	{ name: "max", base: maxBase, variants: maxVariants },
];

for (const { name, base, variants } of groups) {
	describe(`runable ${name} group — diff/apply round-trip`, () => {
		for (const variant of variants) {
			test(`${variant.id} reconstructs from ${base.id} + diff`, () => {
				const diff = diffPlanV1({ from: base, to: variant });
				const reconstructed = applyDiff({ base, diff });
				expect(normalizePlan(reconstructed)).toEqual(normalizePlan(variant));
			});
		}
	});
}
