/**
 * catalogV2.update — child `all_versions` with parents anchored to different
 * child rows. Each sibling edit reaches only the links on THAT row.
 *
 * Contract:
 *   A → child v1, B → child v2. Child all_versions + both in propagate
 *   → A follows v1's edited stock, B follows v2's; anchors stay put.
 *   Same anchors, no propagate → A pins v1's pre-edit 10, B pins v2's 50.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	type CatalogV2Client,
	getFullPlan,
	messagesItem,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const seedDistributedAnchors = async ({
	autumn,
	childId,
	parentAId,
	parentBId,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentAId: string;
	parentBId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: childId, name: "Seat", items: [messagesItem(10)] }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentAId,
				name: "Parent A",
				licenses: [{ license_plan_id: childId, included: 2, version_slug: "v1" }],
			},
		],
	});
	await bumpChild({
		autumn,
		childId,
		items: [messagesItem(50)],
		versioning: "new_version",
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentBId,
				name: "Parent B",
				licenses: [{ license_plan_id: childId, included: 2, version_slug: "v2" }],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions follow reaches only the anchored sibling")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_avdist_c");
		const parentAId = uniqueTestId("cv2_lic_avdist_a");
		const parentBId = uniqueTestId("cv2_lic_avdist_b");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentAId, parentBId],
			run: async () => {
				await seedDistributedAnchors({
					autumn: autumnV2_3,
					childId,
					parentAId,
					parentBId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200), wordsItem(50)],
							propagate: {
								license_parents: [
									{ plan_id: parentAId, version: 1 },
									{ plan_id: parentBId, version: 1 },
								],
							},
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentAId,
					licensePlanId: childId,
					customized: false,
					licenseInternalProductId: childV1.internal_id,
					licenseVersion: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentBId,
					licensePlanId: childId,
					customized: false,
					licenseInternalProductId: childV2.internal_id,
					licenseVersion: 2,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions pin freezes each sibling's pre-edit stock")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_avpin_c");
		const parentAId = uniqueTestId("cv2_lic_avpin_a");
		const parentBId = uniqueTestId("cv2_lic_avpin_b");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentAId, parentBId],
			run: async () => {
				await seedDistributedAnchors({
					autumn: autumnV2_3,
					childId,
					parentAId,
					parentBId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200), wordsItem(50)],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentAId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
					omitFeatureIds: [TestFeature.Words],
					licenseInternalProductId: childV1.internal_id,
					licenseVersion: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentBId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 50,
					omitFeatureIds: [TestFeature.Words],
					licenseInternalProductId: childV2.internal_id,
					licenseVersion: 2,
				});
			},
		});
	},
);
