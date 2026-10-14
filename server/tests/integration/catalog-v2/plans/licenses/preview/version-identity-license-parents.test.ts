import { test } from "bun:test";
import { forceActiveVersion } from "@tests/integration/utils/forceActiveVersion.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("version identity preview: omit license_parents with v2 active tops v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lp_vid_ls_p");
		const childId = uniqueTestId("cv2_lp_vid_ls_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: { license_parents: [{ plan_id: parentId, version: 2 }] },
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
								version: 2,
								licenseAction: "propagated",
								versioning: {
									current_version: 2,
									new_version: null,
									resolved: "existing",
									options: ["existing", "all_versions"],
								},
								siblingVersions: [
									{ version: 1, licenseAction: "unchanged" },
								],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity preview: omit license_parents with v1 active tops v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lp_vid_act_p");
		const childId = uniqueTestId("cv2_lp_vid_act_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await forceActiveVersion({ ctx, planId: parentId, version: 1 });

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
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
								version: 1,
								licenseAction: "propagated",
								versioning: {
									current_version: 2,
									new_version: null,
									resolved: "existing",
									options: ["existing", "all_versions"],
								},
								siblingVersions: [
									{ version: 2, licenseAction: "unchanged" },
								],
							},
						],
					},
				});
			},
		});
	},
);
