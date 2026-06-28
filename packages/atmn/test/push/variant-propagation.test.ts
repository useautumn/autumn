import { expect, test } from "bun:test";
import { getVariantPropagationPreviews } from "../../src/commands/push/variantPropagation.js";

test("getVariantPropagationPreviews dedupes historical variants by plan id", () => {
	const previews = getVariantPropagationPreviews({
		planChange: {
			customize: { price: { amount: 20 } },
			variants: [
				{
					plan_id: "pro_annual",
					version: 1,
					customize: { price: { amount: 120 } },
				},
				{
					plan_id: "pro_annual",
					version: 2,
					customize: { price: { amount: 140 } },
				},
				{
					plan_id: "pro_enterprise",
					version: 1,
					conflicts: [{ reason: "different_interval" }],
				},
			],
		},
	});

	expect(previews).toEqual([
		{
			plan_id: "pro_annual",
			version: 2,
			customize: { price: { amount: 140 } },
		},
		{
			plan_id: "pro_enterprise",
			version: 1,
			conflicts: [{ reason: "different_interval" }],
		},
	]);
});
