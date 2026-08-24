/**
 * catalogV2.update — propagate.license_parents versioning:new_version.
 * Parent absent from plans[].
 *
 * Active has customers → mint, follow the mint, freeze old.
 * No customers → fall back to existing (in-place latest, no mint).
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
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 3,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
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
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version falls back to existing when parent has no customers")}`,
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
