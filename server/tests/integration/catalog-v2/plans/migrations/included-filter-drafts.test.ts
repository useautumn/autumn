/**
 * catalogV2.update draft generators stamp included on remove_items when the
 * from-item is a numbered grant (filterPrecision IdentityAndIncluded).
 *
 * Contract (C1): in-place 100→500 writes remove_items[0].included === 100.
 *
 * Red (current): draft remove filter is feature+interval only.
 * Green (after): the same draft also carries included: 100 so a 1k custom
 * row is not a candidate.
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: 100→500 draft stamps included: 100 on remove_items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_inc");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Included Filter Plan",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
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
											included: 100,
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
