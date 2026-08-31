/**
 * catalogV2.update — propagate.license_parents after the child mints.
 * Parent absent from plans[]. Propagate still MOVES the live link.
 *
 * new_version + customers → mint; the mint anchors child v2.
 * new_version + no customers → no mint; live link still moves to child v2.
 * omit / existing + customers → no mint; live link still moves to child v2.
 * Older parent versions stay on child v1, customized false.
 */
import { expect, test } from "bun:test";
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
	getFullPlan,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version mints when parent active has customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pnv_p");
		const childId = uniqueTestId("cv2_lic_pnv_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const parentV2 = await getFullPlan({ ctx, planId: parentId });
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await seedVersionableCustomer({
					ctx,
					planId: parentId,
					version: 2,
				});

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "new_version" },
						],
					},
				});

				const parentV3 = await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 3,
				});
				expect(parentV3.internal_id).not.toBe(parentV2.internal_id);
				const childV2 = await getFullPlan({ ctx, planId: childId });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 3,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
					licenseInternalProductId: childV2.internal_id,
				});
				for (const parentVersion of [1, 2]) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: parentId,
						parentVersion,
						licensePlanId: childId,
						licenseVersion: 1,
						customized: false,
						messagesAllowance: 10,
						licenseInternalProductId: childV1.internal_id,
					});
				}
				const stillOnV2 = await getFullPlan({
					ctx,
					planId: parentId,
					version: 2,
				});
				expect(stillOnV2.internal_id).toBe(parentV2.internal_id);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version without customers moves latest in place")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pnv0_p");
		const childId = uniqueTestId("cv2_lic_pnv0_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				const parentV2 = await getFullPlan({ ctx, planId: parentId });

				await bumpChild({
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
				const stillV2 = await getFullPlan({ ctx, planId: parentId });
				expect(stillV2.internal_id).toBe(parentV2.internal_id);
				const childV2 = await getFullPlan({ ctx, planId: childId });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
					licenseInternalProductId: childV2.internal_id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
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
	`${chalk.yellowBright("catalogV2 plan-licenses: omit/existing propagate moves latest even with customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pexcus_p");
		const childId = uniqueTestId("cv2_lic_pexcus_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const parentV2 = await getFullPlan({ ctx, planId: parentId });
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await seedVersionableCustomer({
					ctx,
					planId: parentId,
					version: 2,
				});

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					propagate: { license_parents: [{ plan_id: parentId }] },
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 2,
				});
				const stillV2 = await getFullPlan({ ctx, planId: parentId });
				expect(stillV2.internal_id).toBe(parentV2.internal_id);
				const childV2 = await getFullPlan({ ctx, planId: childId });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
					licenseInternalProductId: childV2.internal_id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
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
