/**
 * catalogV2.update — propagate parents that share one license delta collapse
 * into one upsert_licenses op. Empty / price-overridden parents are omitted.
 *
 * Contract:
 *   A1 Team+Scale same 10→200, both have customers, child has none
 *      → 1 draft, 1 op, $or of both parents, upsert_licenses only
 *   A2 Scale has no customers → Team only
 *   A3 Seat price 10→20; Team follows, Ent already $15 → Team only,
 *      nested price 20, no_billing_changes false
 */

import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../utils/seedVersionableCustomer.js";
import {
	messagesItem,
	seedTwoParents,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import {
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
	`${chalk.yellowBright("catalogV2 license-drafts: two propagate parents share one $or upsert_licenses op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_a1_c");
		const teamId = uniqueTestId("cv2_ml_a1_t");
		const scaleId = uniqueTestId("cv2_ml_a1_s");
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

				const plans = [
					{
						plan_id: childId,
						items: [messagesItem(200)],
						propagate: {
							license_parents: [{ plan_id: teamId, version: 1 }, { plan_id: scaleId, version: 1 }],
						},
						migration: { draft: true },
					},
				];
				const planFilter = orVersionPinnedFilter({
					branches: [
						{ planId: teamId },
						{ planId: scaleId },
					],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					preview: true,
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
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: messagesItemDelta({ included: 200 }),
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
	`${chalk.yellowBright("catalogV2 license-drafts: propagate parent without customers is omitted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_a2_c");
		const teamId = uniqueTestId("cv2_ml_a2_t");
		const scaleId = uniqueTestId("cv2_ml_a2_s");
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

				const planFilter = versionPinnedFilter({ planId: teamId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [{ plan_id: teamId, version: 1 }, { plan_id: scaleId, version: 1 }],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: teamId, versions: [1] }]],
					expected: [
						{
							planIds: [teamId],
							omitPlanIds: [childId, scaleId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: messagesItemDelta({ included: 200 }),
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
	`${chalk.yellowBright("catalogV2 license-drafts: priced propagate excludes a price-overridden parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_a3_c");
		const teamId = uniqueTestId("cv2_ml_a3_t");
		const entId = uniqueTestId("cv2_ml_a3_e");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, entId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
							price: monthPrice({ amount: 10 }),
						},
						{
							plan_id: teamId,
							name: "Team",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
						{
							plan_id: entId,
							name: "Ent",
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: { price: monthPrice({ amount: 15 }) },
								},
							],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: entId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: teamId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(10)],
							price: monthPrice({ amount: 20 }),
							propagate: {
								license_parents: [{ plan_id: teamId, version: 1 }, { plan_id: entId, version: 1 }],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: teamId, versions: [1] }]],
					expected: [
						{
							planIds: [teamId],
							omitPlanIds: [childId, entId],
							noBillingChanges: false,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: { price: monthPrice({ amount: 20 }) },
								}),
							],
						},
					],
				});
			},
		});
	},
);
