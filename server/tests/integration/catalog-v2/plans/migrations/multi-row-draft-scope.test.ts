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

			await seedVersionableCustomer({ ctx, planId, version: 1 });
			await seedVersionableCustomer({ ctx, planId, version: 2 });

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
