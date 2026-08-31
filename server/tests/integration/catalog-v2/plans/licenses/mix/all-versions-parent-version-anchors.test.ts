/**
 * catalogV2 — child `all_versions` when the same parent plan has versions
 * anchored to different child rows (Team/EU v1 → Seat v1, v2 → Seat v2).
 *
 * Contract:
 *   Preview nests each parent version under the child sibling it points at
 *   (v2 on license_parents, v1 on sibling_versions[v1].license_parents).
 *   Propagate `{ version_slug: "v1" }` follows only that parent row.
 *   Parent `all_versions` follows every linked parent version from its
 *   anchored child sibling; anchors stay put.
 *
 * Red (current): sibling parent actions resolved against the edited child
 *   row (unchanged); version_slug on propagate was stripped.
 * Green (after): sibling parents resolve against that sibling's upsert;
 *   version_slug pins the named parent version.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	type CatalogV2Client,
	dashboardItem,
	getFullPlan,
	messagesItem,
	seedDistributedParentVersionAnchors,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const editedItems = [messagesItem(200), wordsItem(50)];

/** Child v1 keeps 100 Messages; v2 is 50 Messages + Words. Team v1→v1, v2→v2. */
const seedDivergedChildAnchors = async ({
	autumn,
	childId,
	parentId,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: childId, name: "Seat", items: [messagesItem(100)] }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				name: "Team",
				licenses: [{ license_plan_id: childId, included: 2 }],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childId,
				versioning: "new_version",
				active: true,
				items: [messagesItem(50), wordsItem(10)],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				versioning: "new_version",
				active: true,
				licenses: [
					{ license_plan_id: childId, included: 2, version_slug: "v2" },
				],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions preview nests parent versions on the child sibling they point at")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_avpva_pc");
		const teamId = uniqueTestId("cv2_lic_avpva_team");
		const euId = uniqueTestId("cv2_lic_avpva_eu");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, euId],
			run: async () => {
				await seedDistributedParentVersionAnchors({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, euId],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								versioning: "all_versions",
								items: editedItems,
								propagate: {
									license_parents: [
										{ plan_id: teamId, versioning: "all_versions" },
										{ plan_id: euId, versioning: "all_versions" },
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
								planId: teamId,
								version: 2,
								versionSlug: "v2",
								licenseAction: "propagated",
								siblingVersions: null,
							},
							{
								planId: euId,
								version: 2,
								versionSlug: "v2",
								licenseAction: "propagated",
								siblingVersions: null,
							},
						],
						siblingVersions: [
							{
								version: 1,
								licenseParents: [
									{
										planId: teamId,
										version: 1,
										versionSlug: "v1",
										licenseAction: "propagated",
									},
									{
										planId: euId,
										version: 1,
										versionSlug: "v1",
										licenseAction: "propagated",
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
	`${chalk.yellowBright("catalogV2 plan-licenses: parent version_slug v1 follows only the sibling-linked parent row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_avpva_slug");
		const teamId = uniqueTestId("cv2_lic_avpva_st");
		const euId = uniqueTestId("cv2_lic_avpva_se");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, euId],
			run: async () => {
				await seedDistributedParentVersionAnchors({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, euId],
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: editedItems,
							propagate: {
								license_parents: [{ plan_id: teamId, version_slug: "v1" }],
							},
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: teamId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
					licenseInternalProductId: childV1.internal_id,
					licenseVersion: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: teamId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 50,
					omitFeatureIds: [TestFeature.Words],
					licenseInternalProductId: childV2.internal_id,
					licenseVersion: 2,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: euId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
					omitFeatureIds: [TestFeature.Words],
					licenseInternalProductId: childV1.internal_id,
					licenseVersion: 1,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent all_versions follows each version from its anchored child sibling")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_avpva_all");
		const teamId = uniqueTestId("cv2_lic_avpva_at");
		const euId = uniqueTestId("cv2_lic_avpva_ae");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, euId],
			run: async () => {
				await seedDistributedParentVersionAnchors({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, euId],
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: editedItems,
							propagate: {
								license_parents: [
									{ plan_id: teamId, versioning: "all_versions" },
									{ plan_id: euId, versioning: "all_versions" },
								],
							},
						},
					],
				});

				for (const parentPlanId of [teamId, euId]) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId,
						parentVersion: 1,
						licensePlanId: childId,
						customized: false,
						messagesAllowance: 200,
						licenseInternalProductId: childV1.internal_id,
						licenseVersion: 1,
					});
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId,
						parentVersion: 2,
						licensePlanId: childId,
						customized: false,
						messagesAllowance: 200,
						licenseInternalProductId: childV2.internal_id,
						licenseVersion: 2,
					});
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent v1 follows the child-v1 diff, not a copy of child v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_avpva_diff");
		const teamId = uniqueTestId("cv2_lic_avpva_dt");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(50), wordsItem(10), dashboardItem()],
							propagate: {
								license_parents: [
									{ plan_id: teamId, versioning: "all_versions" },
								],
							},
						},
					],
				});

				const nextChildV1 = await getFullPlan({
					ctx,
					planId: childId,
					version: 1,
				});
				expect(nextChildV1.entitlements).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							feature_id: TestFeature.Messages,
							allowance: 100,
						}),
						expect.objectContaining({ feature_id: TestFeature.Dashboard }),
					]),
				);
				expect(
					nextChildV1.entitlements.some(
						(entitlement) => entitlement.feature_id === TestFeature.Words,
					),
				).toBe(false);

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: teamId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 100,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
					omitFeatureIds: [TestFeature.Words],
					licenseInternalProductId: childV1.internal_id,
					licenseVersion: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: teamId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 50,
					entitlements: [
						{ feature_id: TestFeature.Words, allowance: 10 },
						{ feature_id: TestFeature.Dashboard },
					],
					licenseInternalProductId: childV2.internal_id,
					licenseVersion: 2,
				});
			},
		});
	},
);
