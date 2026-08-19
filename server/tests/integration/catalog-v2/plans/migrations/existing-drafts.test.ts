/**
 * catalogV2.update — migration drafts for in-place existing versioning.
 *
 * Contract:
 *   existing + migratable item diff + versionable customers → one version-pinned draft
 *   omitted migration / no customers / name-only → no draft
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

const seedPlan = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "Draft Plan",
				items: [messagesItem({ included: 100 })],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: existing item update with customers creates a version-pinned draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_ex");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedPlan({ autumn: autumnV2_3, planId });
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});

			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});
			const migrationId = response.migrations?.[0]?.id;
			expect(migrationId).toBeDefined();

			const migrations = await migrationRepo.get({ ctx, id: migrationId });
			expectMigrationDraftsCorrect({
				migrations,
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
								customize: {
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

			await deleteMigrations({ ctx, ids: [migrationId!] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: omitted draft flag / no customers / name-only → no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const withCustomers = uniqueTestId("cv2_mig_omit");
		const noCustomers = uniqueTestId("cv2_mig_noc");
		const nameOnly = uniqueTestId("cv2_mig_name");
		const planIds = [withCustomers, noCustomers, nameOnly];
		await deleteDbPlans({ ctx, planIds });
		try {
			await seedPlan({ autumn: autumnV2_3, planId: withCustomers });
			await seedPlan({ autumn: autumnV2_3, planId: noCustomers });
			await seedPlan({ autumn: autumnV2_3, planId: nameOnly });
			await seedVersionableCustomer({ ctx, planId: withCustomers, version: 1 });
			await seedVersionableCustomer({ ctx, planId: nameOnly, version: 1 });

			const omitted = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: withCustomers,
						items: [messagesItem({ included: 500 })],
					},
				],
			});
			expect(omitted.migrations ?? []).toHaveLength(0);

			const emptyCustomers = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: noCustomers,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expect(emptyCustomers.migrations ?? []).toHaveLength(0);

			const renamed = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: nameOnly,
						name: "Renamed",
						migration: { draft: true },
					},
				],
			});
			expect(renamed.migrations ?? []).toHaveLength(0);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
