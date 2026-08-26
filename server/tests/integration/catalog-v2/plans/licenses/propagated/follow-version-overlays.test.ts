/**
 * catalogV2.update — follow across parent versions when overlays differ.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	seedTwoParentVersions,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const bumpWithWords = ({
	autumn,
	childId,
	propagate,
	versioning,
}: {
	autumn: Parameters<typeof bumpChild>[0]["autumn"];
	childId: string;
	propagate: Parameters<typeof bumpChild>[0]["propagate"];
	versioning?: Parameters<typeof bumpChild>[0]["versioning"];
}) =>
	bumpChild({
		autumn,
		childId,
		items: [messagesItem(200), wordsItem(50)],
		propagate,
		versioning,
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions follow rebases customized v1 and shares stock on v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vfmix_p");
		const childId = uniqueTestId("cv2_lic_vfmix_c");
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
				await bumpWithWords({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "all_versions" },
						],
					},
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 500 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 200 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version follow rebases customized latest; old latest pins")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vnvc_p");
		const childId = uniqueTestId("cv2_lic_vnvc_c");
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
				await seedVersionableCustomer({ ctx, planId: parentId });
				await bumpWithWords({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "new_version" },
						],
					},
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 2,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 500 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 500,
					omitFeatureIds: [TestFeature.Words],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version with customers only on v1 does not mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vnvh_p");
		const childId = uniqueTestId("cv2_lic_vnvh_c");
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
					version: 1,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "new_version" },
						],
					},
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 2,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions follow in place when v1 has customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vallc_p");
		const childId = uniqueTestId("cv2_lic_vallc_c");
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
					version: 1,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "all_versions" },
						],
					},
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 2,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
