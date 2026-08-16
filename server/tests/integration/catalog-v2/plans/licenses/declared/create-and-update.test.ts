/**
 * catalogV2.update — declared plan_license links on a direct parent entry.
 *
 * Contract:
 *   - parent + child created in one batch with licenses:[child] → link exists
 *   - customize add_items/price on an existing parent → customized:true
 *   - licenses: [] removes existing links
 */

import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLicenseLinkCorrect,
	expectLicenseLinkMissing,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: create parent + child with licenses:[child]")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_p");
		const childId = uniqueTestId("cv2_lic_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					prepaidOnly: true,
					customized: false,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customize add_items + price on existing parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cust_p");
		const childId = uniqueTestId("cv2_lic_cust_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										price: { amount: 20, interval: BillingInterval.Month },
										add_items: [itemsV2.monthlyWords({ included: 100 })],
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
					entitlements: [{ feature_id: TestFeature.Words }],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: licenses: [] removes existing links")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_clr_p");
		const childId = uniqueTestId("cv2_lic_clr_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [{ license_plan_id: childId, included: 1 }],
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, licenses: [] }],
				});

				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
				});
			},
		});
	},
);
