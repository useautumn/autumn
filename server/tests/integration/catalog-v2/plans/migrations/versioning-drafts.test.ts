/**
 * catalogV2.update — migration drafts across versioning strategies.
 *
 * Contract:
 *   all_versions identical diffs → one op, unversioned filter
 *   all_versions differing diffs → two version-pinned ops
 *   mixed A new_version + B existing → one draft covering only B
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
	`${chalk.yellowBright("catalogV2 migration: all_versions identical diffs collapse; differing diffs bucket")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const same = uniqueTestId("cv2_mig_all_s");
		const differ = uniqueTestId("cv2_mig_all_d");
		const planIds = [same, differ];
		await deleteDbPlans({ ctx, planIds });
		const createdIds: string[] = [];
		try {
			await seedVersion({
				autumn: autumnV2_3,
				planId: same,
				version: 1,
				included: 100,
			});
			await seedVersion({
				autumn: autumnV2_3,
				planId: same,
				version: 2,
				included: 100,
			});
			await seedVersionableCustomer({ ctx, planId: same, version: 1 });
			await seedVersionableCustomer({ ctx, planId: same, version: 2 });

			await seedVersion({
				autumn: autumnV2_3,
				planId: differ,
				version: 1,
				included: 100,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: differ,
						version: 2,
						name: "V2",
						items: [
							messagesItem({ included: 200 }),
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId: differ, version: 1 });
			await seedVersionableCustomer({ ctx, planId: differ, version: 2 });

			const collapsed = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: same,
						versioning: "all_versions",
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response: collapsed,
				plans: [[{ plan_id: same, versions: [1, 2] }]],
			});
			createdIds.push(collapsed.migrations![0]!.id);

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: collapsed.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [same],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: same, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: { plan_id: same, custom: false },
								customize: messagesCustomize({ included: 500 }),
							},
						],
					},
				],
			});

			const bucketed = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: differ,
						versioning: "all_versions",
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response: bucketed,
				plans: [[{ plan_id: differ, versions: [1, 2] }]],
			});
			createdIds.push(bucketed.migrations![0]!.id);

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: bucketed.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [differ],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: differ, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: differ,
									version: 1,
									custom: false,
								},
								customize: messagesCustomize({ included: 500 }),
							},
							{
								type: "update_plan",
								plan_filter: {
									plan_id: differ,
									version: 2,
									custom: false,
								},
								customize: {
									remove_items: [
										{ feature_id: TestFeature.Dashboard },
										{
											feature_id: TestFeature.Messages,
											interval: ResetInterval.Month,
											interval_count: 1,
										},
									],
									add_items: [
										{
											feature_id: TestFeature.Messages,
											included: 500,
											unlimited: false,
											reset: { interval: ResetInterval.Month },
										},
									],
								},
							},
						],
					},
				],
			});
		} finally {
			await deleteMigrations({ ctx, ids: createdIds });
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: all_versions with customers only on v1 pins version 1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_sib");
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
			await seedVersionableCustomer({ ctx, planId, version: 1 });

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

			await deleteMigrations({
				ctx,
				ids: [response.migrations![0]!.id],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: mixed new_version + existing drafts only the existing plan")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const minted = uniqueTestId("cv2_mig_mix_a");
		const updated = uniqueTestId("cv2_mig_mix_b");
		const planIds = [minted, updated];
		await deleteDbPlans({ ctx, planIds });
		try {
			await seedVersion({
				autumn: autumnV2_3,
				planId: minted,
				version: 1,
				included: 100,
			});
			await seedVersion({
				autumn: autumnV2_3,
				planId: updated,
				version: 1,
				included: 100,
			});
			await seedVersionableCustomer({ ctx, planId: minted, version: 1 });
			await seedVersionableCustomer({ ctx, planId: updated, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: minted,
						versioning: "new_version",
						items: [messagesItem({ included: 500 })],
					},
					{
						plan_id: updated,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});

			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: updated, versions: [1] }]],
			});
			await deleteMigrations({
				ctx,
				ids: (response.migrations ?? []).map((migration) => migration.id),
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
