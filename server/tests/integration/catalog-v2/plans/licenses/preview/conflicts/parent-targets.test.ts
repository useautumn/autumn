/**
 * catalogV2.preview_update — license_parents[].conflicts across multiple
 * parents / parent versions. Only the relative that actually diverged lists.
 * One entry per parent plan; older linked versions nest under sibling_versions.
 *
 * Contract:
 *   - two parents, only A customized, propagate both
 *     → A value_divergence, B none; both propagated
 *   - two parent versions, v1 customized, propagate omit (latest)
 *     → v2 propagated no conflict; sibling v1 unchanged + conflict
 *   - same setup, propagate all_versions
 *     → both propagated; only sibling v1 has the conflict
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	seedLinkedChildParent,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../../utils/seedLicensePlans.js";

const messagesOverride = {
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(500)],
};

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
	autumn: Parameters<typeof seedLinkedChildParent>[0]["autumn"];
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
						customize: messagesOverride,
					},
				],
			},
		],
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents conflicts: only the customized parent lists")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentA = uniqueTestId("cv2_lpc_a");
		const parentB = uniqueTestId("cv2_lpc_b");
		const childId = uniqueTestId("cv2_lpc_ab_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentA, parentB, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: parentA,
					childId,
					customize: messagesOverride,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentB,
							name: "Parent 2",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: {
									license_parents: [{ plan_id: parentA, version: 1 }, { plan_id: parentB, version: 1 }],
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
								planId: parentA,
								licenseAction: "propagated",
								conflicts: [messagesValueDivergence],
							},
							{
								planId: parentB,
								licenseAction: "propagated",
								conflicts: null,
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license_parents conflicts: omit version follows latest, historical still lists")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpc_omit_p");
		const childId = uniqueTestId("cv2_lpc_omit_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await customizeParentVersion({
					autumn: autumnV2_3,
					parentId,
					childId,
					version: 1,
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
	`${chalk.yellowBright("catalogV2 license_parents conflicts: all_versions follows both, only customized lists")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lpc_all_p");
		const childId = uniqueTestId("cv2_lpc_all_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await customizeParentVersion({
					autumn: autumnV2_3,
					parentId,
					childId,
					version: 1,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: {
									license_parents: [
										{ plan_id: parentId, version: 1 },
										{ plan_id: parentId, version: 2 },
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
								conflicts: null,
								siblingVersions: [
									{
										version: 1,
										licenseAction: "propagated",
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
