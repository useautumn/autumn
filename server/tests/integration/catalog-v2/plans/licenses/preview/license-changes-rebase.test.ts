/**
 * catalogV2.preview_update — customized follow rebase and declared
 * swallowing the child-edit conflict.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_changes: follow rebase nests Words add, not a child-won messages slot")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_reb_p");
		const childId = uniqueTestId("cv2_lc_reb_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200), wordsItem(50)],
								propagate: { license_parents: [{ plan_id: parentId }] },
							},
							{ plan_id: parentId },
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
								plan_change: {
									item_changes: [
										{
											action: "created",
											feature_id: TestFeature.Words,
										},
									],
								},
							},
						],
					},
				});
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: parentId,
								licenseAction: "propagated",
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents: declared+propagate omits child-edit conflict")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lc_sw_p");
		const childId = uniqueTestId("cv2_lc_sw_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: { license_parents: [{ plan_id: parentId }] },
							},
							{
								plan_id: parentId,
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
						planId: childId,
						licenseParents: [
							{
								planId: parentId,
								licenseAction: "explicit",
								conflicts: null,
							},
						],
					},
				});
			},
		});
	},
);
