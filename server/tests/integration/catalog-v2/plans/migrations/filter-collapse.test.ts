/**
 * catalogV2.update — migration filter pinning vs unversioned collapse.
 *
 * Contract:
 *   pinned historical version stays pinned (never collapses to all versions)
 *   all_versions covering every customer-bearing version collapses even if
 *   a customer-free sibling exists (unversioned { plan_id } matches all
 *   versions at run time)
 *   mixed strategies in one call: independent filters, create is skipped
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectMigrationDraftsCorrect,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const messagesItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const messagesCustomize = ({ included }: { included: number }) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: TestFeature.Messages,
			included,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	],
});

const seedVersion = async ({
	autumn,
	planId,
	version,
	included,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	version: number;
	included: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				version,
				name: `V${version}`,
				items: [messagesItem({ included })],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: pinned historical v1 stays version-pinned while v2 exists")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedVersion({
				autumn: autumnV2_3,
				planId,
				version: 1,
				included: 100,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, versioning: "new_version" }],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [planId],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: planId, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: planId,
									version: 1,
									custom: false,
								},
								customize: messagesCustomize({ included: 500 }),
							},
						],
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: all_versions collapses even when a customer-free v3 exists")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_v3");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedVersion({
				autumn: autumnV2_3,
				planId,
				version: 1,
				included: 100,
			});
			await seedVersion({
				autumn: autumnV2_3,
				planId,
				version: 2,
				included: 100,
			});
			await seedVersion({
				autumn: autumnV2_3,
				planId,
				version: 3,
				included: 100,
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });
			await seedVersionableCustomer({ ctx, planId, version: 2 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1, 2] }]],
			});

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [planId],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: planId, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: { plan_id: planId, custom: false },
								customize: messagesCustomize({ included: 500 }),
							},
						],
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: mixed all_versions + pinned + create drafts only the customer-bearing updates")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const allVersions = uniqueTestId("cv2_mig_mx_a");
		const pinned = uniqueTestId("cv2_mig_mx_b");
		const created = uniqueTestId("cv2_mig_mx_c");
		const planIds = [allVersions, pinned, created];
		await deleteDbPlans({ ctx, planIds });
		try {
			await seedVersion({
				autumn: autumnV2_3,
				planId: allVersions,
				version: 1,
				included: 100,
			});
			await seedVersion({
				autumn: autumnV2_3,
				planId: allVersions,
				version: 2,
				included: 100,
			});
			await seedVersionableCustomer({ ctx, planId: allVersions, version: 1 });
			await seedVersionableCustomer({ ctx, planId: allVersions, version: 2 });

			await seedVersion({
				autumn: autumnV2_3,
				planId: pinned,
				version: 1,
				included: 100,
			});
			await seedVersion({
				autumn: autumnV2_3,
				planId: pinned,
				version: 2,
				included: 100,
			});
			await seedVersionableCustomer({ ctx, planId: pinned, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: allVersions,
						versioning: "all_versions",
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
					{
						plan_id: pinned,
						version: 1,
						items: [messagesItem({ included: 200 })],
						migration: { draft: true },
					},
					{
						plan_id: created,
						name: "Brand New",
						items: [messagesItem({ included: 50 })],
						migration: { draft: true },
					},
				],
			});

			expectUpdateMigrations({
				response,
				plans: [
					[
						{ plan_id: allVersions, versions: [1, 2] },
						{ plan_id: pinned, versions: [1] },
					],
				],
			});
			expect(response.migrations).toHaveLength(1);

			const allVersionsOp = {
				type: "update_plan" as const,
				plan_filter: { plan_id: allVersions, custom: false },
				customize: messagesCustomize({ included: 500 }),
			};
			const pinnedOp = {
				type: "update_plan" as const,
				plan_filter: {
					plan_id: pinned,
					version: 1,
					custom: false,
				},
				customize: messagesCustomize({ included: 200 }),
			};
			const operations = [allVersionsOp, pinnedOp].sort((left, right) =>
				left.plan_filter.plan_id.localeCompare(right.plan_filter.plan_id),
			);
			const branches = [allVersions, pinned]
				.sort((a, b) => a.localeCompare(b))
				.map((planId) =>
					planId === pinned
						? { plan_id: planId, version: 1 }
						: { plan_id: planId },
				);

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [allVersions, pinned],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { $or: branches, custom: false },
							},
						},
						operations,
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
