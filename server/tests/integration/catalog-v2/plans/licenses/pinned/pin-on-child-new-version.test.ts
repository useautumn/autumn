/**
 * catalogV2.update — child versioning:new_version re-points the catalog
 * license at the minted child row. Overlay freeze is still the pin planner.
 */
import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child new_version re-points absent parent to v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_repoint_p");
		const childId = uniqueTestId("cv2_lic_repoint_c");
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
				});

				const childV2 = await getFullPlan({ ctx, planId: childId });
				expect(childV2.version).toBe(2);
				expect(childV2.internal_id).not.toBe(childV1.internal_id);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: true,
					messagesAllowance: 10,
					licenseInternalProductId: childV2.internal_id,
				});
			},
		});
	},
);
