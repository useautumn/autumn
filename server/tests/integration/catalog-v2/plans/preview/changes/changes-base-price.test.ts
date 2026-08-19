/**
 * catalogV2.preview_update — price_change + customize.price.
 *
 * Spec asserts BOTH price_change { previous, current } and customize.price
 * (toBasePriceParams shape). Additional currencies: amount change for shared
 * currency diffs; add/remove alone should not (still RED).
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	PreviewUpdateCatalogResponseSchema,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";

const month20 = {
	amount: 20,
	interval: BillingInterval.Month,
} as const;

const month30 = {
	amount: 30,
	interval: BillingInterval.Month,
} as const;

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: add base price none → $20/mo")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_add");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Free Then Paid" }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, price: { ...month20 } }],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					priceChange: {
						previous: null,
						current: { ...month20 },
					},
					customize: { price: { ...month20 } },
				},
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, basePrice: null }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: amount 20 → 30")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_amt");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Amt", price: { ...month20 } }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, price: { ...month30 } }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					priceChange: {
						previous: { ...month20 },
						current: { ...month30 },
					},
					customize: { price: { ...month30 } },
				},
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, basePrice: { ...month20 } }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: interval month → year")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_ivl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Ivl", price: { ...month20 } }],
			});
			const year20 = {
				amount: 20,
				interval: BillingInterval.Year,
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, price: year20 }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					priceChange: {
						previous: { ...month20 },
						current: year20,
					},
					customize: { price: year20 },
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// interval_count 1→3 diffs; explicit 1 ≡ omitted → no price diff
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: interval_count 1→3; explicit 1 → no diff")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_ic");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "IC", price: { ...month20 } }],
			});

			const noDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							price: { ...month20, interval_count: 1 },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: noDiff,
				expected: {
					planId,
					action: "none",
					planChange: null,
				},
			});

			const withDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							price: { ...month20, interval_count: 3 },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: withDiff,
				expected: {
					planId,
					action: "update",
					customize: {
						price: { ...month20, interval_count: 3 },
					},
					priceChange: {
						previous: { ...month20 },
						current: { ...month20, interval_count: 3 },
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: remove price → null")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_rm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Rm", price: { ...month20 } }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, price: null }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					priceChange: {
						previous: { ...month20 },
						current: null,
					},
					customize: { price: null },
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// shared currency amount change diffs
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: additional currency amount change → diff")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_fx");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "FX",
						price: {
							...month20,
							additional_currencies: [{ currency: "eur", amount: 18 }],
						},
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							price: {
								...month20,
								additional_currencies: [{ currency: "eur", amount: 22 }],
							},
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					customize: {
						price: {
							...month20,
							additional_currencies: [{ currency: "eur", amount: 22 }],
						},
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Currency add/remove alone is NOT a price diff (compatible rule)
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: currency add/remove only → no price diff")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_fxn");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "FX None",
						price: {
							...month20,
							additional_currencies: [{ currency: "eur", amount: 18 }],
						},
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							price: { ...month20 },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "none",
					planChange: null,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// items-only update must not populate price_change / customize.price
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-base-price: items-only → no price_change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cbp_items");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Items",
						price: { ...month20 },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 50,
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					],
				}),
			);
			// Full contract: changes present with item diffs, but no price lane.
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					priceChange: null,
				},
			});
			const row = preview.plans.find((p) => p.plan_id === planId);
			expect(
				row?.plan_change != null,
				"plan_change must be present for items-only",
			).toBe(true);
			expect(row?.plan_change?.customize?.price == null).toBe(true);
			expect((row?.plan_change?.item_changes ?? []).length).toBeGreaterThan(0);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
