/**
 * catalogV2.preview_update + update — create and delete each billing-control
 * lane from a plan that had none. Preview must parse (no null arrays).
 */

import { expect, test } from "bun:test";
import {
	type CustomerBillingControls,
	PreviewUpdateCatalogResponseSchema,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";

const lanes = {
	auto_topups: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			threshold: 10,
			quantity: 100,
		},
	],
	spend_limits: [
		{
			feature_id: TestFeature.Messages,
			overage_limit: 50,
			enabled: true,
		},
	],
	usage_limits: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			limit: 1000,
			interval: ResetInterval.Month,
		},
	],
	usage_alerts: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			threshold: 80,
			threshold_type: "usage_percentage" as const,
		},
	],
	overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
} as const;

test.concurrent(
	`${chalk.yellowBright("catalogV2 billing-control lanes: preview+update create and delete each type")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_bc_lanes");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "BC Lanes" }],
			});

			const clearedLanes: CustomerBillingControls = {};

			for (const [key, items] of Object.entries(lanes)) {
				const createPreview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{ plan_id: planId, billing_controls: { [key]: items } },
						],
					}),
				);
				PreviewUpdateCatalogResponseSchema.parse(createPreview);
				expectPlanPreviewRowCorrect({
					preview: createPreview,
					expected: {
						planId,
						action: "update",
						previousAttributes: null,
						customize: null,
						itemChanges: [],
						priceChange: null,
					},
				});

				const created = await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, billing_controls: { [key]: items } }],
				});
				expectCatalogResultsCorrect({
					response: created,
					plans: [{ id: planId, action: "update" }],
				});
				await expectCatalogPlansCorrect({
					autumn: autumnV2_3,
					expected: [{ id: planId, billingControls: { [key]: items } }],
				});

				const deletePreview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{ plan_id: planId, billing_controls: { [key]: [] } },
						],
					}),
				);
				PreviewUpdateCatalogResponseSchema.parse(deletePreview);
				expectPlanPreviewRowCorrect({
					preview: deletePreview,
					expected: {
						planId,
						action: "update",
						previousAttributes: { billing_controls: { [key]: items } },
						customize: null,
						itemChanges: [],
						priceChange: null,
					},
				});

				const deleted = await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, billing_controls: { [key]: [] } }],
				});
				expectCatalogResultsCorrect({
					response: deleted,
					plans: [{ id: planId, action: "update" }],
				});
				clearedLanes[key as keyof CustomerBillingControls] = [];
				await expectCatalogPlansCorrect({
					autumn: autumnV2_3,
					expected: [{ id: planId, billingControlsExact: { ...clearedLanes } }],
				});
			}
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 billing-control lanes: null previous arrays never appear in preview")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_bc_null");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "BC Null" }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							billing_controls: { spend_limits: lanes.spend_limits },
						},
					],
				}),
			);
			const billingControls =
				preview.plans[0]?.plan_change?.previous_attributes
					?.billing_controls ?? {};
			expect(JSON.stringify(billingControls)).not.toContain("null");
			expect(billingControls.spend_limits).toBeUndefined();
			PreviewUpdateCatalogResponseSchema.parse(preview);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
