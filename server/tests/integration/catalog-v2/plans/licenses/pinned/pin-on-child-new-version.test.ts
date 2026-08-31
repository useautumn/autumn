/**
 * catalogV2.update — child versioning:new_version leaves a non-propagated
 * parent's license link untouched: still anchored to child v1, no manufactured
 * freeze overlay, same plan_license row.
 *
 * Red (current):  the mint re-points the link to v2 and clones a frozen overlay
 * Green (after):  the link is version-anchored — no repoint, no overlay
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
	`${chalk.yellowBright("catalogV2 plan-licenses: child new_version leaves absent parent anchored to v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_anchor_p");
		const childId = uniqueTestId("cv2_lic_anchor_c");
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
				const before = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseInternalProductId: childV1.internal_id,
				});

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
					licenseVersion: 1,
					included: 2,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
					planLicenseId: before.planLicense.id,
				});
			},
		});
	},
);
