/**
 * catalogV2.preview_update — migrations block is a projection of computed drafts.
 * Preview does not persist a migration row.
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { parsePlanPreview } from "./utils/expectPlanPreview.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";

const messagesItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview: migrations block for a draftable item update; nothing persisted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_prev");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Preview Draft",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const before = await migrationRepo.get({ ctx });
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem({ included: 500 })],
							migration: { draft: true },
						},
					],
				}),
			);

			expect(preview.migrations).toHaveLength(1);
			const migration = preview.migrations[0]!;
			expect(migration).toMatchObject({
				plans: [{ plan_id: planId, versions: [1] }],
				include_custom: false,
				no_billing_changes: true,
			});
			expect(migration).not.toHaveProperty("id");
			expect(migration.filter).toEqual({
				customer: {
					plan: { plan_id: planId, version: 1, custom: false },
				},
			});
			expect(migration.operations?.customer).toHaveLength(1);

			const after = await migrationRepo.get({ ctx });
			expect(after).toHaveLength(before.length);

			const priced = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							price: { amount: 20, interval: BillingInterval.Month },
							migration: { draft: true },
						},
					],
				}),
			);
			expect(priced.migrations[0]?.no_billing_changes).toBe(false);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
