/**
 * catalogV2.update — same-call child item edit × parent licenses[] customize.
 *
 * Non-overlapping slots compose: child adds a boolean, parent customizes the
 * license base price → both land on the parent's license product.
 * Same slot: both change messages → declared customize wins; the child still
 * has its own new allowance.
 */
import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLicenseLinkCorrect,
	expectPlanMessagesAllowance,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	dashboardItem,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child boolean + declared license price both land")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mix_slots_p");
		const childId = uniqueTestId("cv2_lic_mix_slots_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(10), dashboardItem()],
						},
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										price: { amount: 20, interval: BillingInterval.Month },
									},
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: true,
					price: { amount: 20, interval: BillingInterval.Month },
					messagesAllowance: 10,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared messages customize beats child messages edit")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mix_slot_p");
		const childId = uniqueTestId("cv2_lic_mix_slot_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
						},
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(300)],
									},
								},
							],
						},
					],
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
					customized: true,
					messagesAllowance: 300,
				});
			},
		});
	},
);
