/**
 * catalogV2.update — assigned seat × declared licenses[] PUT.
 * Customize retires the referenced row; licenses: [] retires, not deletes.
 */
import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectCustomerLicensePinnedTo,
	expectLicenseLinkCorrect,
	expectLicenseLinkMissing,
	expectPlanLicenseRetired,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	messagesOverride,
	seedAssignedLicenseCustomer,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared customize retires assigned seat")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cdecl_p");
		const childId = uniqueTestId("cv2_lic_cdecl_c");
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

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(300),
								},
							],
						},
					],
				});

				const catalog = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
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
	`${chalk.yellowBright("catalogV2 plan-licenses: licenses: [] retires assigned seat, does not delete")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cclr_p");
		const childId = uniqueTestId("cv2_lic_cclr_c");
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

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, licenses: [] }],
				});

				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
				});
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
