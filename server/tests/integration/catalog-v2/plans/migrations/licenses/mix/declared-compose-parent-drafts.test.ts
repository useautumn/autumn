/**
 * catalogV2.update — declared licenses[] is the FINAL parent op, exclusive
 * with propagate on that parent. Two parents with different customize
 * must not share an $or op.
 *
 * Contract:
 *   D1 child adds Dashboard + Team declares $20 → one Team op with both
 *   D2 Team declares $20, Scale only propagates → two parent ops
 *   D3 child 10→200, Team declares 300 → Team op is 300
 */

import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../utils/seedVersionableCustomer.js";
import {
	dashboardItem,
	messagesItem,
	seedLinkedChildParent,
	seedTwoParents,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import {
	dashboardAddItem,
	expectLicenseDraftCase,
	messagesItemDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../utils/expectLicenseMigrationDrafts.js";

const monthPrice = ({ amount }: { amount: number }) => ({
	amount,
	interval: BillingInterval.Month,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: declared compose is one parent op (boolean + price)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_d1_c");
		const teamId = uniqueTestId("cv2_ml_d1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: teamId });
				const plans = [
					{
						plan_id: childId,
						items: [messagesItem(10), dashboardItem()],
						propagate: { license_parents: [{ plan_id: teamId, version: 1 }] },
						migration: { draft: true },
					},
					{
						plan_id: teamId,
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: { price: monthPrice({ amount: 20 }) },
							},
						],
						migration: { draft: true },
					},
				];
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					preview: true,
					responsePlans: [[{ plan_id: teamId, versions: [1] }]],
					expected: [
						{
							planIds: [teamId],
							omitPlanIds: [childId],
							noBillingChanges: false,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: {
										price: monthPrice({ amount: 20 }),
										add_items: [dashboardAddItem],
									},
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: declared vs propagate parents do not share an op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_d2_c");
		const teamId = uniqueTestId("cv2_ml_d2_t");
		const scaleId = uniqueTestId("cv2_ml_d2_s");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, scaleId],
			run: async () => {
				await seedTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, scaleId],
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: scaleId, version: 1 });

				const teamFilter = versionPinnedFilter({ planId: teamId });
				const scaleFilter = versionPinnedFilter({ planId: scaleId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(10), dashboardItem()],
							propagate: {
								license_parents: [{ plan_id: teamId, version: 1 }, { plan_id: scaleId, version: 1 }],
							},
							migration: { draft: true },
						},
						{
							plan_id: teamId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: { price: monthPrice({ amount: 20 }) },
								},
							],
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: teamId, versions: [1] },
							{ plan_id: scaleId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [teamId, scaleId],
							omitPlanIds: [childId],
							noBillingChanges: false,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [
											{ planId: teamId },
											{ planId: scaleId },
										],
									}),
								},
							},
							operations: [
								parentLicenseOp({
									planFilter: teamFilter,
									childId,
									customize: {
										price: monthPrice({ amount: 20 }),
										add_items: [dashboardAddItem],
									},
								}),
								parentLicenseOp({
									planFilter: scaleFilter,
									childId,
									customize: { add_items: [dashboardAddItem] },
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: declared messages customize wins over the child edit")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_d3_c");
		const teamId = uniqueTestId("cv2_ml_d3_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: teamId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: teamId, version: 1 }] },
							migration: { draft: true },
						},
						{
							plan_id: teamId,
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
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: teamId, versions: [1] }]],
					expected: [
						{
							planIds: [teamId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: messagesItemDelta({ included: 300 }),
								}),
							],
						},
					],
				});
			},
		});
	},
);
