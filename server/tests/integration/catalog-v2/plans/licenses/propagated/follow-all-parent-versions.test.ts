/**
 * catalogV2.update — pin every parent version to follow.
 * Parent absent from plans[]. Each pinned row follows.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pinning every parent version follows each row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pav_p");
		const childId = uniqueTestId("cv2_lic_pav_c");
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
							{ plan_id: parentId, version: 1 },
							{ plan_id: parentId, version: 2 },
						],
					},
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					included: 2,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					included: 2,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
