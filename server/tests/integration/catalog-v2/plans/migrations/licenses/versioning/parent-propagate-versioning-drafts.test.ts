/**
 * catalogV2.update — parent propagate versioning is independent of the child.
 * Parent versions without customers are omitted. Child all_versions does
 * not strip the parent version pin.
 *
 * Contract:
 *   F1 propagate latest; Team v1+v2, customers only on v1 → no parent op
 *   F2 propagate version:1, customers on v1 → parent op pinned to 1
 *   F3 all_versions: customers on v1 only → pin v1; v1+v2 same delta → collapse
 *   F4 new_version: mints parent v2; v1 customers get child + parent license ops
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { expectPlanMessagesAllowance } from "../../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	seedLinkedChildParent,
	seedTwoParentVersions,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: propagate latest skips a customered historical parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_f1_c");
		const teamId = uniqueTestId("cv2_ml_f1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedTwoParentVersions({
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
							propagate: { license_parents: [{ plan_id: teamId }] },
							migration: { draft: true },
						},
					],
					preview: true,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: propagate explicit version pins the parent op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_f2_c");
		const teamId = uniqueTestId("cv2_ml_f2_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: teamId, version: 1 });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [{ plan_id: teamId, version: 1 }],
							},
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
	`${chalk.yellowBright("catalogV2 license-drafts: propagate all_versions pins or collapses by who has customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const pinnedChild = uniqueTestId("cv2_ml_f3a_c");
		const pinnedTeam = uniqueTestId("cv2_ml_f3a_t");
		const collapsedChild = uniqueTestId("cv2_ml_f3b_c");
		const collapsedTeam = uniqueTestId("cv2_ml_f3b_t");
		await withCatalogPlans({
			ctx,
			planIds: [pinnedChild, pinnedTeam, collapsedChild, collapsedTeam],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId: pinnedTeam,
					childId: pinnedChild,
				});
				await seedVersionableCustomer({
					ctx,
					planId: pinnedTeam,
					version: 1,
				});

				const pinnedFilter = versionPinnedFilter({
					planId: pinnedTeam,
					version: 1,
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: pinnedChild,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: pinnedTeam, versioning: "all_versions" },
								],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: pinnedTeam, versions: [1] }]],
					expected: [
						{
							planIds: [pinnedTeam],
							omitPlanIds: [pinnedChild],
							noBillingChanges: true,
							filter: { customer: { plan: pinnedFilter } },
							operations: [
								parentLicenseOp({
									planFilter: pinnedFilter,
									childId: pinnedChild,
									customize: messagesItemDelta({ included: 200 }),
								}),
							],
						},
					],
				});

				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId: collapsedTeam,
					childId: collapsedChild,
				});
				await seedVersionableCustomer({
					ctx,
					planId: collapsedTeam,
					version: 1,
				});
				await seedVersionableCustomer({
					ctx,
					planId: collapsedTeam,
					version: 2,
				});

				const collapsedFilter = collapsedPlanFilter({ planId: collapsedTeam });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: collapsedChild,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: collapsedTeam, versioning: "all_versions" },
								],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: collapsedTeam, versions: [1, 2] }]],
					expected: [
						{
							planIds: [collapsedTeam],
							omitPlanIds: [collapsedChild],
							noBillingChanges: true,
							filter: { customer: { plan: collapsedFilter } },
							operations: [
								parentLicenseOp({
									planFilter: collapsedFilter,
									childId: collapsedChild,
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
	`${chalk.yellowBright("catalogV2 license-drafts: propagate new_version never drafts the mint or the pin")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_f4_c");
		const teamId = uniqueTestId("cv2_ml_f4_t");
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
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: teamId, versioning: "new_version" },
								],
							},
							migration: { draft: true },
						},
					],
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
