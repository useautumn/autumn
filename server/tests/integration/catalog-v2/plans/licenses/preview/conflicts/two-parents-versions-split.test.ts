import { test } from "bun:test";
import type { CatalogPropagateTargetParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../../preview/utils/expectPlanPreview.js";
import {
	type CatalogV2Client,
	messagesItem,
	messagesOverride,
	seedTwoParentsWithTwoVersions,
	withCatalogPlans,
} from "../../utils/seedLicensePlans.js";

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

const customizeParentVersion = ({
	autumn,
	parentId,
	childId,
	version,
}: {
	autumn: CatalogV2Client;
	parentId: string;
	childId: string;
	version: number;
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				version,
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

const previewChildBump = ({
	autumn,
	childId,
	licenseParents,
}: {
	autumn: CatalogV2Client;
	childId: string;
	licenseParents: CatalogPropagateTargetParams[];
}) =>
	autumn.catalogV2.previewUpdate({
		plans: [
			{
				plan_id: childId,
				items: [messagesItem(200)],
				propagate: { license_parents: licenseParents },
			},
		],
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents conflicts: all_versions on one parent, the other nests as unchanged")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lpc_2pv_c");
		const followId = uniqueTestId("cv2_lpc_2pv_follow");
		const pinId = uniqueTestId("cv2_lpc_2pv_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});

				const preview = parsePlanPreview(
					await previewChildBump({
						autumn: autumnV2_3,
						childId,
						licenseParents: [
							{ plan_id: followId, version: 1 },
							{ plan_id: followId, version: 2 },
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: followId,
								version: 2,
								licenseAction: "propagated",
								conflicts: null,
								siblingVersions: [
									{ version: 1, licenseAction: "propagated", conflicts: null },
								],
							},
							{
								planId: pinId,
								version: 2,
								licenseAction: "unchanged",
								conflicts: null,
								siblingVersions: [
									{ version: 1, licenseAction: "unchanged", conflicts: null },
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
	`${chalk.yellowBright("catalogV2 license_parents conflicts: divergence lists on the customized version of each parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lpc_2pvo_c");
		const followId = uniqueTestId("cv2_lpc_2pvo_follow");
		const pinId = uniqueTestId("cv2_lpc_2pvo_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});
				for (const parentId of [followId, pinId]) {
					await customizeParentVersion({
						autumn: autumnV2_3,
						parentId,
						childId,
						version: 1,
					});
				}

				const preview = parsePlanPreview(
					await previewChildBump({
						autumn: autumnV2_3,
						childId,
						licenseParents: [
							{ plan_id: followId, version: 1 },
							{ plan_id: followId, version: 2 },
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: followId,
								version: 2,
								licenseAction: "propagated",
								conflicts: null,
								siblingVersions: [
									{
										version: 1,
										licenseAction: "propagated",
										conflicts: [messagesValueDivergence],
									},
								],
							},
							{
								planId: pinId,
								version: 2,
								licenseAction: "unchanged",
								conflicts: null,
								siblingVersions: [
									{
										version: 1,
										licenseAction: "unchanged",
										conflicts: [messagesValueDivergence],
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
	`${chalk.yellowBright("catalogV2 license_parents conflicts: pinning a version leaves the lane entry unchanged and the sibling propagated")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lpc_2pvp_c");
		const followId = uniqueTestId("cv2_lpc_2pvp_follow");
		const pinId = uniqueTestId("cv2_lpc_2pvp_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});

				const preview = parsePlanPreview(
					await previewChildBump({
						autumn: autumnV2_3,
						childId,
						licenseParents: [{ plan_id: followId, version: 1 }],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: followId,
								version: 2,
								licenseAction: "unchanged",
								siblingVersions: [{ version: 1, licenseAction: "propagated" }],
							},
							{
								planId: pinId,
								version: 2,
								licenseAction: "unchanged",
								siblingVersions: [{ version: 1, licenseAction: "unchanged" }],
							},
						],
					},
				});
			},
		});
	},
);
