import { expect, test } from "bun:test";
import { catalogPreviewToPushResult } from "../../src/commands/push/push.js";
import {
	getDirectVariantUpdatePreviews,
	getVariantPropagationPreviews,
} from "../../src/commands/push/variantPropagation.js";

test("getVariantPropagationPreviews dedupes historical variants by plan id", () => {
	const previews = getVariantPropagationPreviews({
		planChange: {
			variants: [
				{
					plan_id: "pro_annual",
					name: "Pro Annual",
					update_source: "propagated",
					version: 1,
					versionable: true,
					customize: { price: { amount: 120 } },
				},
				{
					plan_id: "pro_annual",
					name: "Pro Annual",
					update_source: "propagated",
					version: 2,
					versionable: true,
					customize: { price: { amount: 140 } },
				},
				{
					plan_id: "pro_enterprise",
					name: "Pro Enterprise",
					update_source: "propagated",
					version: 1,
					versionable: true,
					conflicts: [{ reason: "different_interval" }],
				},
			],
		},
	});

	expect(previews).toEqual([
		{
			plan_id: "pro_annual",
			name: "Pro Annual",
			update_source: "propagated",
			version: 2,
			versionable: true,
			customize: { price: { amount: 140 } },
		},
		{
			plan_id: "pro_enterprise",
			name: "Pro Enterprise",
			update_source: "propagated",
			version: 1,
			versionable: true,
			conflicts: [{ reason: "different_interval" }],
		},
	]);
});

test("variant preview helpers split direct updates from propagation choices", () => {
	const planChange = {
		variants: [
			{
				plan_id: "pro_annual",
				name: "Pro Annual",
				version: 1,
				versionable: true,
				will_apply: true,
				update_source: "direct" as const,
				customize: { price: { amount: 200 } },
			},
			{
				plan_id: "pro_team",
				name: "Pro Team",
				version: 1,
				versionable: true,
				will_apply: false,
				update_source: "propagated" as const,
				customize: { price: { amount: 20 } },
			},
		],
	};

	expect(getDirectVariantUpdatePreviews({ planChange })).toEqual([
		{
			plan_id: "pro_annual",
			name: "Pro Annual",
			version: 1,
			versionable: true,
			will_apply: true,
			update_source: "direct",
			customize: { price: { amount: 200 } },
		},
	]);
	expect(getVariantPropagationPreviews({ planChange })).toEqual([
		{
			plan_id: "pro_team",
			name: "Pro Team",
			version: 1,
			versionable: true,
			will_apply: false,
			update_source: "propagated",
			customize: { price: { amount: 20 } },
		},
	]);
});

test("catalogPreviewToPushResult counts direct variant updates", () => {
	const result = catalogPreviewToPushResult({
		feature_changes: [],
		plan_changes: [
			{
				action: "none",
				plan_id: "pro",
				variants: [
					{
						plan_id: "pro_annual",
						name: "Pro Annual",
						versionable: true,
						will_apply: true,
						update_source: "direct",
					},
				],
			},
		],
	} as never);

	expect(result.plansVersioned).toEqual(["pro_annual"]);
	expect(result.plansUpdated).toEqual([]);
});
