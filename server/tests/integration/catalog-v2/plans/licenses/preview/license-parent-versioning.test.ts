/**
 * catalogV2.preview_update — each license parent reports the versioning strategy
 * that actually resolves for that parent plan.
 *
 * Contract:
 *   - new_version + customers → mint v3, resolved new_version, v1/v2 unchanged
 *   - new_version + no customers → latest v2 follows, resolved existing
 *   - all_versions / pinned version → resolved strategy and per-version actions agree
 *
 * Red (current): parent mints are absent and license parents have no versioning.
 * Green (after): the lane's top row and versioning describe the actual target.
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
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
	`${chalk.yellowBright("catalogV2 license_parents versioning: new_version surfaces the parent mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpv_mint_p");
		const childId = uniqueTestId("cv2_lpv_mint_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await seedVersionableCustomer({
					ctx,
					planId: parentId,
					version: 2,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: {
									license_parents: [
										{ plan_id: parentId, versioning: "new_version" },
									],
								},
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
								version: 3,
								hasCustomers: true,
								hasPlanChange: true,
								licenseAction: "propagated",
								conflicts: null,
								versioning: {
									current_version: 2,
									new_version: 3,
									resolved: "new_version",
									options: ["existing", "new_version", "all_versions"],
								},
								siblingVersions: [
									{ version: 1, licenseAction: "unchanged" },
									{
										version: 2,
										hasCustomers: true,
										licenseAction: "unchanged",
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents versioning: new_version without customers resolves existing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpv_fallback_p");
		const childId = uniqueTestId("cv2_lpv_fallback_c");
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
								propagate: {
									license_parents: [
										{ plan_id: parentId, versioning: "new_version" },
									],
								},
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
								siblingVersions: [{ version: 1, licenseAction: "unchanged" }],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents versioning: all_versions and pinned targets report their resolved scope")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpv_scope_p");
		const childId = uniqueTestId("cv2_lpv_scope_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});

				for (const target of [
					{ plan_id: parentId, versioning: "all_versions" as const },
					{ plan_id: parentId, version: 1 },
				]) {
					const preview = parsePlanPreview(
						await autumnV2_3.catalogV2.previewUpdate({
							plans: [
								{
									plan_id: childId,
									items: [messagesItem(200)],
									propagate: { license_parents: [target] },
								},
							],
						}),
					);
					const allVersions = target.versioning === "all_versions";

					expectPlanPreviewRowCorrect({
						preview,
						expected: {
							planId: childId,
							licenseParents: [
								{
									planId: parentId,
									version: 2,
									licenseAction: allVersions ? "propagated" : "unchanged",
									versioning: {
										current_version: 2,
										new_version: null,
										resolved: allVersions ? "all_versions" : "existing",
										options: ["existing", "all_versions"],
									},
									siblingVersions: [
										{ version: 1, licenseAction: "propagated" },
									],
								},
							],
						},
					});
				}
			},
		});
	},
);
