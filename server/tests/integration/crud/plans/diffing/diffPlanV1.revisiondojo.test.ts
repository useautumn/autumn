import { type ApiPlanV1 } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import { applyDiff } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import {
	proBase,
	proVariants,
	plusBase,
	plusVariants,
	teacherProBase,
	teacherProVariants,
} from "./diffPlanV1.revisiondojo.fixtures.js";
import { normalizePlan } from "./utils/normalizePlan.js";

// --- test matrix ---
const groups = [
	{ name: "pro", base: proBase, variants: proVariants },
	{ name: "plus", base: plusBase, variants: plusVariants },
	{ name: "teacher_pro", base: teacherProBase, variants: teacherProVariants },
];

for (const { name, base, variants } of groups) {
	describe(`revisiondojo ${name} group — diff/apply round-trip`, () => {
		for (const variant of variants) {
			test(`${variant.id} reconstructs from ${base.id} + diff`, () => {
				const diff = diffPlanV1({ from: base, to: variant });
				const reconstructed = applyDiff({ base, diff });
				expect(normalizePlan(reconstructed)).toEqual(normalizePlan(variant));
			});
		}
	});
}
