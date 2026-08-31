/**
 * catalogV2.update — parent listed in the child's propagate.license_parents
 * follows an in-place child item change (uncustomized links share stock).
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLicenseLinkCorrect,
	expectPlanMessagesAllowance,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: in-batch parent adopts uncustomized child item change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_adopt_p");
		const childId = uniqueTestId("cv2_lic_adopt_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
					parentPlans: [{ plan_id: parentId, name: "Parent" }],
				});

				await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
