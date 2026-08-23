/**
 * catalogV2.update — child versioning × parent/propagate versioning.
 *
 * Contract:
 *   G1 child all_versions + Team existing: child ops v1+v2; parent latest only
 *   G2 child all_versions + Team all_versions: child v1, parent v2
 *   G3 Team all_versions rename + propagate all_versions → license-only parent op
 *   G4 child new_version + Team all_versions, no draft → no draft
 *   G5 Team new_version in plans[] + propagate latest → no parent op
 *   G6 preview of G1 equals the update draft minus id; preview persists nothing
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { expectPlanMessagesAllowance } from "../../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	seedLinkedChildParent,
	seedParentVersionWithLicense,
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
import { seedChildVersionsThenParent } from "../utils/seedLicenseDraftPlans.js";

const g1Expected = ({
	childId,
	teamId,
}: {
	childId: string;
	teamId: string;
}) => {
	const childFilter = collapsedPlanFilter({ planId: childId });
	const teamFilter = versionPinnedFilter({ planId: teamId, version: 2 });
	return {
		planIds: [childId, teamId],
		noBillingChanges: true as const,
		filter: {
			customer: {
				plan: orPlanFilter({
					branches: [
						{ plan_id: childId },
						{ plan_id: teamId, version: 2 },
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
	};
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: child all_versions + parent existing keeps the parent version pin")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_g1_c");
		const teamId = uniqueTestId("cv2_ml_g1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				await seedParentVersionWithLicense({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: childId, version: 2 });
				await seedVersionableCustomer({ ctx, planId: teamId, version: 2 });

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: teamId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: childId, versions: [1, 2] },
							{ plan_id: teamId, versions: [2] },
						],
					],
					expected: [g1Expected({ childId, teamId })],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: child all_versions + parent all_versions target disjoint versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_g2_c");
		const teamId = uniqueTestId("cv2_ml_g2_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				await seedParentVersionWithLicense({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: teamId, version: 2 });

				const childFilter = versionPinnedFilter({
					planId: childId,
					version: 1,
				});
				const teamFilter = versionPinnedFilter({
					planId: teamId,
					version: 2,
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: teamId, versioning: "all_versions" },
								],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: childId, versions: [1] },
							{ plan_id: teamId, versions: [2] },
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
											{ plan_id: teamId, version: 2 },
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
	`${chalk.yellowBright("catalogV2 license-drafts: parent all_versions rename is not migratable; license op remains")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_g3_c");
		const teamId = uniqueTestId("cv2_ml_g3_t");
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
				await seedVersionableCustomer({ ctx, planId: teamId, version: 2 });

				const teamFilter = collapsedPlanFilter({ planId: teamId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: teamId, versioning: "all_versions" },
								],
							},
							migration: { draft: true },
						},
						{
							plan_id: teamId,
							versioning: "all_versions",
							name: "Team renamed",
						},
					],
					responsePlans: [[{ plan_id: teamId, versions: [1, 2] }]],
					expected: [
						{
							planIds: [teamId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: { customer: { plan: teamFilter } },
							operations: [
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
	`${chalk.yellowBright("catalogV2 license-drafts: child new_version + parent all_versions without draft → no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_g4_c");
		const teamId = uniqueTestId("cv2_ml_g4_t");
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
				await seedVersionableCustomer({ ctx, planId: teamId, version: 2 });

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							versioning: "new_version", active: true,
							propagate: {
								license_parents: [
									{ plan_id: teamId, versioning: "all_versions" },
								],
							},
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: parent new_version in plans[] + propagate latest → child op only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_g5_c");
		const teamId = uniqueTestId("cv2_ml_g5_t");
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
						{
							plan_id: teamId,
							versioning: "new_version", active: true,
							name: "Team v2",
						},
					],
					responsePlans: [[{ plan_id: childId, versions: [1] }]],
					expected: [
						{
							planIds: [childId],
							omitPlanIds: [teamId],
							noBillingChanges: true,
							filter: { customer: { plan: childFilter } },
							operations: [
								childItemOp({
									planFilter: childFilter,
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
	`${chalk.yellowBright("catalogV2 license-drafts: preview of child all_versions + parent existing matches update and persists nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_g6_c");
		const teamId = uniqueTestId("cv2_ml_g6_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId: teamId,
				});
				await seedParentVersionWithLicense({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: childId, version: 2 });
				await seedVersionableCustomer({ ctx, planId: teamId, version: 2 });

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: teamId }] },
							migration: { draft: true },
						},
					],
					preview: true,
					responsePlans: [
						[
							{ plan_id: childId, versions: [1, 2] },
							{ plan_id: teamId, versions: [2] },
						],
					],
					expected: [g1Expected({ childId, teamId })],
				});
			},
		});
	},
);
