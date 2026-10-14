import { test } from "bun:test";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration.js";
import chalk from "chalk";
import {
	customization,
	expectRolloverCarriedToPool,
	setupPrepaidOverageCredits,
} from "./utils/prepaidOverageRolloverCarry.js";

test(
	chalk.yellowBright(
		"pooled rollover carry (update_plan migration): a prepaid rollover carries onto a pooled included item despite the signature mismatch",
	),
	async () => {
		const scenario = await setupPrepaidOverageCredits({
			customerId: "prepaid-overage-to-pooled-migration",
		});
		const planId = scenario.plan.id;

		await runUpdatePlanMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_2,
			migrationId: `${scenario.customerId}-mig-${Date.now()}`,
			customerId: scenario.customerId,
			filter: { customer: { plan: { plan_id: planId } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planId },
						customize: customization,
					},
				],
			},
			runOnServer: false,
		});

		await expectRolloverCarriedToPool({ scenario });
	},
);
