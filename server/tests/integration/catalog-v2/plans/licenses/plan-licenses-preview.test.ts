/**
 * catalogV2.preview_update — licenses lane on a direct parent row.
 *
 * Declared licenses[] renders the planned post-update set; omitting the key
 * echoes current links unchanged.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses preview: declared set vs omitted key")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_prev_p");
		const childA = uniqueTestId("cv2_lic_prev_a");
		const childB = uniqueTestId("cv2_lic_prev_b");
		await deleteDbPlans({ ctx, planIds: [parentId, childA, childB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: childA,
						name: "Seat A",
						items: [messagesItem(10)],
					},
					{
						plan_id: childB,
						name: "Seat B",
						items: [messagesItem(5)],
					},
					{
						plan_id: parentId,
						name: "Parent",
						licenses: [{ license_plan_id: childA, included: 1 }],
					},
				],
			});

			const omitted = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: parentId, name: "Parent Renamed" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: omitted,
				expected: {
					planId: parentId,
					action: "update",
					licenses: [
						{
							license_plan_id: childA,
							version: 1,
							included: 1,
							prepaid_only: true,
						},
					],
				},
			});

			const declared = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: parentId,
							licenses: [{ license_plan_id: childB, included: 3 }],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: declared,
				expected: {
					planId: parentId,
					licenses: [
						{
							license_plan_id: childB,
							version: 1,
							included: 3,
							prepaid_only: true,
						},
					],
				},
			});
			expect(
				declared.plans.find((p) => p.plan_id === parentId)?.licenses,
			).not.toEqual(
				omitted.plans.find((p) => p.plan_id === parentId)?.licenses,
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, childA, childB] });
		}
	},
);
