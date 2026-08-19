/**
 * catalogV2.update — groupTargetsByCustomize collapses identical customize
 * across plans. Two children with the same item delta share one child op.
 * Two parents share one upsert_licenses op only when that payload is identical
 * (same license_plan_ids + nested customize). Different children on different
 * parents must not $or together — customizeToKey has to see upsert_licenses.
 *
 * Contract:
 *   H1 both children add Dashboard; Team+Scale each offer both
 *      → 1 child $or + 1 parent $or with two upserts
 *   H2 both children replace Messages with Words (same remove+add)
 *      → same collapse, richer customize
 *   H3 same Dashboard add; Team offers Seat only, Scale offers Pack only
 *      → child ops still collapse; parent ops stay split
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../utils/seedVersionableCustomer.js";
import {
	dashboardItem,
	messagesItem,
	seedTwoParentsWithTwoChildren,
	withCatalogPlans,
	wordsItem,
} from "../../../licenses/utils/seedLicensePlans.js";
import {
	childItemOp,
	dashboardAddCustomize,
	expectLicenseDraftCase,
	messagesToWordsDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	parentLicensesOp,
	versionPinnedFilter,
} from "../utils/expectLicenseMigrationDrafts.js";

const seedCustomersOn = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		await seedVersionableCustomer({ ctx, planId, version: 1 });
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: two children adding the same boolean collapse child + parent ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const seatId = uniqueTestId("cv2_ml_h1_seat");
		const packId = uniqueTestId("cv2_ml_h1_pack");
		const teamId = uniqueTestId("cv2_ml_h1_team");
		const scaleId = uniqueTestId("cv2_ml_h1_scale");
		const planIds = [seatId, packId, teamId, scaleId];
		await withCatalogPlans({
			ctx,
			planIds,
			run: async () => {
				await seedTwoParentsWithTwoChildren({
					autumn: autumnV2_3,
					childIds: [seatId, packId],
					parentIds: [teamId, scaleId],
				});
				await seedCustomersOn({ ctx, planIds });

				const childFilter = orVersionPinnedFilter({
					branches: [{ planId: seatId }, { planId: packId }],
				});
				const parentFilter = orVersionPinnedFilter({
					branches: [{ planId: teamId }, { planId: scaleId }],
				});
				const plans = [seatId, packId].map((planId) => ({
					plan_id: planId,
					items: [messagesItem(10), dashboardItem()],
					propagate: {
						license_parents: [{ plan_id: teamId }, { plan_id: scaleId }],
					},
					migration: { draft: true },
				}));
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					preview: true,
					responsePlans: [planIds.map((plan_id) => ({ plan_id, versions: [1] }))],
					expected: [
						{
							planIds,
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: planIds.map((planId) => ({ planId })),
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: childFilter,
									customize: dashboardAddCustomize,
								}),
								parentLicensesOp({
									planFilter: parentFilter,
									upserts: [
										{ childId: seatId, customize: dashboardAddCustomize },
										{ childId: packId, customize: dashboardAddCustomize },
									],
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
	`${chalk.yellowBright("catalogV2 license-drafts: two children replacing Messages with Words collapse the same way")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const seatId = uniqueTestId("cv2_ml_h2_seat");
		const packId = uniqueTestId("cv2_ml_h2_pack");
		const teamId = uniqueTestId("cv2_ml_h2_team");
		const scaleId = uniqueTestId("cv2_ml_h2_scale");
		const planIds = [seatId, packId, teamId, scaleId];
		await withCatalogPlans({
			ctx,
			planIds,
			run: async () => {
				await seedTwoParentsWithTwoChildren({
					autumn: autumnV2_3,
					childIds: [seatId, packId],
					parentIds: [teamId, scaleId],
				});
				await seedCustomersOn({ ctx, planIds });

				const childFilter = orVersionPinnedFilter({
					branches: [{ planId: seatId }, { planId: packId }],
				});
				const parentFilter = orVersionPinnedFilter({
					branches: [{ planId: teamId }, { planId: scaleId }],
				});
				const customize = messagesToWordsDelta();
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [seatId, packId].map((planId) => ({
						plan_id: planId,
						items: [wordsItem(100)],
						propagate: {
							license_parents: [{ plan_id: teamId }, { plan_id: scaleId }],
						},
						migration: { draft: true },
					})),
					responsePlans: [planIds.map((plan_id) => ({ plan_id, versions: [1] }))],
					expected: [
						{
							planIds,
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: planIds.map((planId) => ({ planId })),
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: childFilter,
									customize,
								}),
								parentLicensesOp({
									planFilter: parentFilter,
									upserts: [
										{ childId: seatId, customize },
										{ childId: packId, customize },
									],
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
	`${chalk.yellowBright("catalogV2 license-drafts: same child delta on different license_plan_ids does not $or parents")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const seatId = uniqueTestId("cv2_ml_h3_seat");
		const packId = uniqueTestId("cv2_ml_h3_pack");
		const teamId = uniqueTestId("cv2_ml_h3_team");
		const scaleId = uniqueTestId("cv2_ml_h3_scale");
		const planIds = [seatId, packId, teamId, scaleId];
		await withCatalogPlans({
			ctx,
			planIds,
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: seatId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: packId,
							name: "Pack",
							items: [messagesItem(10)],
						},
						{
							plan_id: teamId,
							name: "Team",
							licenses: [{ license_plan_id: seatId, included: 2 }],
						},
						{
							plan_id: scaleId,
							name: "Scale",
							licenses: [{ license_plan_id: packId, included: 2 }],
						},
					],
				});
				await seedCustomersOn({ ctx, planIds });

				const childFilter = orVersionPinnedFilter({
					branches: [{ planId: seatId }, { planId: packId }],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: seatId,
							items: [messagesItem(10), dashboardItem()],
							propagate: { license_parents: [{ plan_id: teamId }] },
							migration: { draft: true },
						},
						{
							plan_id: packId,
							items: [messagesItem(10), dashboardItem()],
							propagate: { license_parents: [{ plan_id: scaleId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [planIds.map((plan_id) => ({ plan_id, versions: [1] }))],
					expected: [
						{
							planIds,
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: planIds.map((planId) => ({ planId })),
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: childFilter,
									customize: dashboardAddCustomize,
								}),
								parentLicenseOp({
									planFilter: versionPinnedFilter({ planId: teamId }),
									childId: seatId,
									customize: dashboardAddCustomize,
								}),
								parentLicenseOp({
									planFilter: versionPinnedFilter({ planId: scaleId }),
									childId: packId,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);
