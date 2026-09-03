/**
 * catalogV2.update — a draft claims the row its entry named, not the plan.
 *
 * With one entry per plan, "any direct row of this plan" and "the row this
 * entry named" were the same set. Multi-row payloads split them: a request
 * that states v1 and v2 has two direct rows, and a `migration.draft` on one
 * of them must not drag the other into the same migration.
 *
 * Contract:
 *   B6  migration.draft on a version-pinned entry drafts that version only,
 *       even when the same request carries other rows of the same plan
 *
 * Red (current): the matcher falls back to `source === "direct"`, so the
 *   draft claims every direct row of the plan.
 * Green (after): it claims the row the entry resolved to.
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const messagesItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: an unpinned draft claims the active row, not its siblings")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_multirow");
		await deleteDbPlans({ ctx, planIds: [planId] });

		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Multi Row Draft",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem({ included: 200 })],
						versioning: "new_version",
						active: true,
					},
				],
			});

			// Customers on both rows, so either could legitimately produce a draft.
			await seedVersionableCustomer({ ctx, planId, version: 1 });
			await seedVersionableCustomer({ ctx, planId, version: 2 });

			// B6: the draft entry is UNPINNED, so it names the active row (v2). The
			// same request also pins v1. An unpinned entry used to fall back to
			// "any direct row of this plan", which with multi-row swallows v1 too.
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem({ included: 250 })],
						migration: { draft: true },
					},
					{
						plan_id: planId,
						version: 1,
						items: [messagesItem({ included: 150 })],
					},
				],
			});

			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [2] }]],
			});
		} finally {
			await deleteMigrations({ ctx, ids: [planId] });
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
