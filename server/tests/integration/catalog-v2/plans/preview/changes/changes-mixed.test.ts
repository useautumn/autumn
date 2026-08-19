/**
 * catalogV2.preview_update — mixed changes blocks in one entry / multi-plan.
 *
 * Mixed change blocks in one entry / multi-plan; create → plan_change omitted.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	PreviewUpdateCatalogResponseSchema,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectDbPlansAbsent,
} from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	findPlanPreviewRow,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-mixed: details + price + items + trial coherent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cm_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Old",
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
							name: "New",
							price: { amount: 20, interval: BillingInterval.Month },
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 50,
									reset: { interval: ResetInterval.Month },
								},
							],
							free_trial: {
								duration_length: 7,
								duration_type: FreeTrialDuration.Day,
								card_required: false,
							},
						},
					],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.plan_change != null).toBe(true);
			expect(row.plan_change?.previous_attributes).toMatchObject({ name: "Old" });
			expect(row.plan_change?.price_change != null).toBe(true);
			expect((row.plan_change?.item_changes ?? []).length).toBeGreaterThan(0);
			expect(row.plan_change?.customize?.price != null).toBe(true);
			expect(row.plan_change?.customize?.add_items != null).toBe(true);
			expect(row.plan_change?.customize?.remove_items != null).toBe(true);
			expect(row.plan_change?.customize?.free_trial != null).toBe(true);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Creates have no diff — plan_change is omitted; the row action conveys it.
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-mixed: create full shape → plan_change omitted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cm_create");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							name: "Created",
							price: { amount: 20, interval: BillingInterval.Month },
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 10,
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "create",
					planChange: null,
				},
			});
			await expectDbPlansAbsent({ ctx, planIds: [planId] });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// items + price, details untouched → previous_attributes null/empty
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-mixed: items+price, details untouched → no previous_attributes")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cm_nodet");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stable Name",
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
							name: "Stable Name",
							price: { amount: 20, interval: BillingInterval.Month },
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
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.plan_change != null).toBe(true);
			expect(row.plan_change?.previous_attributes == null).toBe(true);
			expect(row.plan_change?.price_change != null).toBe(true);
			expect((row.plan_change?.item_changes ?? []).length).toBeGreaterThan(0);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// multi-plan: each row's changes scoped to its own plan
test.concurrent(
	`${chalk.yellowBright("catalogV2 changes-mixed: multi-plan changes scoped per row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_cm_a");
		const planB = uniqueTestId("cv2_cm_b");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, name: "A1" },
					{ plan_id: planB, name: "B1" },
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{ plan_id: planA, name: "A2" },
						{
							plan_id: planB,
							price: { amount: 10, interval: BillingInterval.Month },
						},
					],
				}),
			);
			const rowA = findPlanPreviewRow({ preview, planId: planA });
			const rowB = findPlanPreviewRow({ preview, planId: planB });
			expect(rowA.plan_change != null).toBe(true);
			expect(rowB.plan_change != null).toBe(true);
			expect(rowA.plan_change?.previous_attributes).toMatchObject({ name: "A1" });
			expect(rowA.plan_change?.price_change == null).toBe(true);
			expect(rowB.plan_change?.price_change != null).toBe(true);
			expect(rowB.plan_change?.previous_attributes == null).toBe(true);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);
