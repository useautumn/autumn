/**
 * catalogV2.update — assigned seat (customer_licenses.plan_license_id).
 * Pin retires the referenced catalog row; the customer stays on the old id.
 */
import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectCustomerLicensePinnedTo,
	expectLicenseLinkCorrect,
	expectPlanLicenseRetired,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	seedAssignedLicenseCustomer,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pin retires assigned seat; customer stays on old row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cpin_p");
		const childId = uniqueTestId("cv2_lic_cpin_c");
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

				await bumpChild({ autumn: autumnV2_3, childId });

				const catalog = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				expect(catalog.planLicense.id).not.toBe(assigned.planLicenseId);
				await expectPlanLicenseRetired({
					ctx,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child new_version leaves assigned seat and catalog link untouched")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cmint_p");
		const childId = uniqueTestId("cv2_lic_cmint_c");
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
				const assigned = await seedAssignedLicenseCustomer({
					ctx,
					parentId,
					childId,
				});

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
				});

				// No write: catalog and customer share the same live row, still on v1.
				const catalog = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
					planLicenseId: assigned.planLicenseId,
				});
				expect(catalog.planLicense.is_custom).toBe(false);
				await expectCustomerLicensePinnedTo({
					ctx,
					customerLicenseId: assigned.customerLicenseId,
					planLicenseId: assigned.planLicenseId,
				});
			},
		});
	},
);
