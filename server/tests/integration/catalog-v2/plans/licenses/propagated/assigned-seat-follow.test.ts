/**
 * catalogV2.update — assigned seat on an uncustomized follow.
 * No plan_license write; the customer shares stock and sees 200.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectCustomerLicensePinnedTo,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	seedAssignedLicenseCustomer,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: follow shares stock with assigned seat")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cfoll_p");
		const childId = uniqueTestId("cv2_lic_cfoll_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const assigned = await seedAssignedLicenseCustomer({
					ctx,
					parentId,
					childId,
				});

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: { license_parents: [{ plan_id: parentId }] },
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
					planLicenseId: assigned.planLicenseId,
				});
				await expectCustomerLicensePinnedTo({
					ctx,
					customerLicenseId: assigned.customerLicenseId,
					planLicenseId: assigned.planLicenseId,
				});
			},
		});
	},
);
