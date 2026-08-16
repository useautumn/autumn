/**
 * catalogV2.preview_update — all_versions sibling license_changes
 * must match the direct row's declared write.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	messagesOverride,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: all_versions declared write does not drift on siblings")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_sib_p");
		const childId = uniqueTestId("cv2_lc_sib_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							version: 1,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(500),
								},
							],
						},
					],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: parentId,
								versioning: "all_versions",
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: messagesOverride(300),
									},
								],
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: parentId,
						licenseChanges: [
							{
								action: "updated",
								license_plan_id: childId,
							},
						],
						siblingVersions: [
							{
								version: 1,
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});
			},
		});
	},
);
