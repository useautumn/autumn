/**
 * catalogV2.update — who counts as a draft population for propagate.
 *
 * Contract:
 *   B1 assigned seats are parent customers, never the child plan_id
 *   B2 direct child attach + parent customers → 1 draft, 2 disjoint ops
 *   B3 overlay on the edited slot → empty delta, that parent omitted
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../utils/seedVersionableCustomer.js";
import {
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	seedSeatAssignmentOnChild,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import {
	childItemOp,
	expectLicenseDraftCase,
	messagesItemDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../utils/expectLicenseMigrationDrafts.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: seat assignment CPs never appear as the child plan")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_b1_c");
		const teamId = uniqueTestId("cv2_ml_b1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedSeatAssignmentOnChild({
					ctx,
					parentId: teamId,
					childId,
				});

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
	`${chalk.yellowBright("catalogV2 license-drafts: direct child + parent customers → two disjoint ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_b2_c");
		const teamId = uniqueTestId("cv2_ml_b2_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				const childFilter = versionPinnedFilter({ planId: childId });
				const teamFilter = versionPinnedFilter({ planId: teamId });
				const plans = [
					{
						plan_id: childId,
						items: [messagesItem(200)],
						propagate: { license_parents: [{ plan_id: teamId, version: 1 }] },
						migration: { draft: true },
					},
				];
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					preview: true,
					responsePlans: [
						[
							{ plan_id: childId, versions: [1] },
							{ plan_id: teamId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [childId, teamId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [
											{ planId: childId },
											{ planId: teamId },
										],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: childFilter,
									customize: messagesItemDelta({ included: 200 }),
								}),
								parentLicenseOp({
									planFilter: teamFilter,
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
	`${chalk.yellowBright("catalogV2 license-drafts: overlay on the edited slot omits that parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_b3_c");
		const teamId = uniqueTestId("cv2_ml_b3_t");
		const scaleId = uniqueTestId("cv2_ml_b3_s");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, scaleId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(500)],
						},
						{
							plan_id: teamId,
							name: "Team",
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(900),
								},
							],
						},
						{
							plan_id: scaleId,
							name: "Scale",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: scaleId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: scaleId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(1000)],
							propagate: {
								license_parents: [{ plan_id: teamId, version: 1 }, { plan_id: scaleId, version: 1 }],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: scaleId, versions: [1] }]],
					expected: [
						{
							planIds: [scaleId],
							omitPlanIds: [childId, teamId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: messagesItemDelta({
										included: 1000,
										fromIncluded: 500,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);
