/**
 * catalogV2.update — declared licenses[] accept pooled items.
 *
 * Contract:
 *   pooled item on the child → link persists
 *   pooled item in customize add_items → customized link persists
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import { messagesItem, withCatalogPlans } from "../utils/seedLicensePlans.js";

const pooledMessages = {
	feature_id: TestFeature.Messages,
	included: 10,
	reset: { interval: ResetInterval.Month },
	pooled: true,
};

const pooledWords = {
	feature_id: TestFeature.Words,
	included: 10,
	reset: { interval: ResetInterval.Month },
	pooled: true,
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pooled item on child links")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pool_p");
		const childId = uniqueTestId("cv2_lic_pool_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [pooledMessages],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [{ license_plan_id: childId, included: 1 }],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 1,
					customized: false,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pooled item in customize add_items links")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_poolc_p");
		const childId = uniqueTestId("cv2_lic_poolc_c");
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
									included: 1,
									customize: { add_items: [pooledWords] },
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 1,
					customized: true,
					messagesAllowance: 10,
					entitlements: [{ feature_id: TestFeature.Words, allowance: 10 }],
				});
			},
		});
	},
);
