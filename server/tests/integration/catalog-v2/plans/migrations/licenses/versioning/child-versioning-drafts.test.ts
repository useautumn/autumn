import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { expectPlanMessagesAllowance } from "../../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../../utils/seedVersionableCustomer.js";
import {
	childItemOp,
	collapsedPlanFilter,
	expectLicenseDraftCase,
	messagesItemDelta,
	orPlanFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../utils/expectLicenseMigrationDrafts.js";
import { seedChildVersionsThenParent } from "../utils/seedLicenseDraftPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: child existing skips v1 customers; parent follows latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_e1_c");
		const teamId = uniqueTestId("cv2_ml_e1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
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
	`${chalk.yellowBright("catalogV2 license-drafts: child all_versions pins the child op to versions with customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_e2_c");
		const teamId = uniqueTestId("cv2_ml_e2_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				const childFilter = versionPinnedFilter({ planId: childId, version: 1 });
				const teamFilter = versionPinnedFilter({ planId: teamId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: teamId, version: 1 }] },
							migration: { draft: true },
						},
					],
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
									plan: orPlanFilter({
										branches: [
											{ plan_id: childId, version: 1 },
											{ plan_id: teamId, version: 1 },
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
	`${chalk.yellowBright("catalogV2 license-drafts: child all_versions collapses identical per-version deltas")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_e3_c");
		const teamId = uniqueTestId("cv2_ml_e3_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: childId, version: 2 });
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				const childFilter = collapsedPlanFilter({ planId: childId });
				const teamFilter = versionPinnedFilter({ planId: teamId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: teamId, version: 1 }] },
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: childId, versions: [1, 2] },
							{ plan_id: teamId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [childId, teamId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orPlanFilter({
										branches: [
											{ plan_id: childId },
											{ plan_id: teamId, version: 1 },
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
	`${chalk.yellowBright("catalogV2 license-drafts: child new_version without draft never drafts parents")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_e4_c");
		const teamId = uniqueTestId("cv2_ml_e4_t");
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

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							versioning: "new_version", active: true,
							propagate: { license_parents: [{ plan_id: teamId, version: 1 }] },
						},
					],
					expected: [],
				});
				await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
			},
		});
	},
);
