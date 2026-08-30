/**
 * catalogV2.update — same-batch declared licenses[] vs child propagate.
 *
 * Declared is exclusive. version_slug stated → that row.
 * version_slug omitted → keep the existing link. Propagate does not move it.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: same-batch omit + propagate stays on current child")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_momit_p");
		const childId = uniqueTestId("cv2_lic_momit_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "new_version" },
						],
					},
					parentPlans: [
						{
							plan_id: parentId,
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: same-batch version_slug v1 + propagate stays on v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mslug_p");
		const childId = uniqueTestId("cv2_lic_mslug_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "new_version" },
						],
					},
					parentPlans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									version_slug: "v1",
								},
							],
						},
					],
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);
