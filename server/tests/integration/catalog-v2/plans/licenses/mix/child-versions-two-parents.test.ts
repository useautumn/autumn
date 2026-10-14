import { test } from "bun:test";
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
	bumpChild,
	type CatalogV2Client,
	getFullPlan,
	messagesItem,
	seedTwoParentsWithTwoVersions,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const seedChildVersionOverTwoParents = async ({
	autumn,
	childId,
	parentIds,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentIds: [string, string];
}) => {
	await seedTwoParentsWithTwoVersions({ autumn, childId, parentIds });
	await bumpChild({
		autumn,
		childId,
		items: [messagesItem(50)],
		versioning: "new_version",
	});
};

const expectEveryParentRowAnchoredToV1 = async ({
	ctx,
	parentIds,
	childId,
	childV1InternalId,
}: {
	ctx: Parameters<typeof expectLicenseLinkCorrect>[0]["ctx"];
	parentIds: string[];
	childId: string;
	childV1InternalId: string;
}) => {
	for (const parentPlanId of parentIds) {
		for (const parentVersion of [1, 2]) {
			await expectLicenseLinkCorrect({
				ctx,
				parentPlanId,
				parentVersion,
				licensePlanId: childId,
				licenseVersion: 1,
				customized: false,
				messagesAllowance: 10,
				omitFeatureIds: [TestFeature.Words],
				licenseInternalProductId: childV1InternalId,
			});
		}
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child new_version leaves every parent row anchored to v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_cv2p_c");
		const teamId = uniqueTestId("cv2_lic_cv2p_team");
		const orgId = uniqueTestId("cv2_lic_cv2p_org");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, orgId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, orgId],
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});

				await expectEveryParentRowAnchoredToV1({
					ctx,
					parentIds: [teamId, orgId],
					childId,
					childV1InternalId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: in-place edit of child v2 never reaches links anchored to v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_cv2f_c");
		const followId = uniqueTestId("cv2_lic_cv2f_follow");
		const pinId = uniqueTestId("cv2_lic_cv2f_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(200), wordsItem(50)],
				});

				await expectEveryParentRowAnchoredToV1({
					ctx,
					parentIds: [followId, pinId],
					childId,
					childV1InternalId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: preview puts v1-anchored parents on sibling_versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_cv2p_pc");
		const followId = uniqueTestId("cv2_lic_cv2p_pfollow");
		const pinId = uniqueTestId("cv2_lic_cv2p_ppin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedChildVersionOverTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200), wordsItem(50)],
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: null,
						siblingVersions: [
							{
								version: 1,
								licenseParents: [
									{
										planId: followId,
										licenseAction: "unchanged",
									},
									{
										planId: pinId,
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
