import { expect, test } from "bun:test";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runPush } from "../../../../packages/atmn/src/actions/push";
import { createClient } from "../../../../packages/atmn/src/generated/client";
import { seedVersionableCustomer } from "../catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const catalogConfig = ({
	featureId,
	planId,
	amount,
}: {
	featureId: string;
	planId: string;
	amount: number;
}) => `{
	features: [
		feature({ featureId: "${featureId}", name: "Messages", type: "metered", consumable: true }),
	],
	plans: [
		{
			planId: "${planId}",
			name: "Pro",
			active: true,
			versionSlug: "v1",
			price: { amount: ${amount}, interval: "month" },
			items: [{ featureId: "${featureId}", included: 100, reset: { interval: "month" } }],
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn push: an in-place price change drafts a migration for a customered plan")}`,
	async () => {
		const featureId = uniqueTestId("atmn_mig_msgs");
		const planId = uniqueTestId("atmn_mig_pro");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: catalogConfig({ featureId, planId, amount: 20 }),
		});

		try {
			await scenario.push();
			await seedVersionableCustomer({ ctx: scenario.ctx, planId, version: 1 });

			scenario.writeConfig(
				atmnConfigSource({
					body: catalogConfig({ featureId, planId, amount: 25 }),
				}),
			);

			const client = createClient({
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl: scenario.baseUrl,
			});
			const result = await runPush({ client, cwd: scenario.cwd });

			expect(result.preview.migrations ?? []).not.toHaveLength(0);
			expect(result.migrationIds).not.toHaveLength(0);

			const [migration] = await migrationRepo.get({
				ctx: scenario.ctx,
				id: result.migrationIds[0],
			});
			expect(migration).toBeDefined();
			expect(migration.archived).toBe(false);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn push: the same in-place price change drafts nothing for a plan with no customers")}`,
	async () => {
		const featureId = uniqueTestId("atmn_mig_quiet_msgs");
		const planId = uniqueTestId("atmn_mig_quiet_pro");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: catalogConfig({ featureId, planId, amount: 20 }),
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: catalogConfig({ featureId, planId, amount: 25 }),
				}),
			);
			const applied = await scenario.push();

			expect(applied.migrationIds).toHaveLength(0);
		} finally {
			scenario.cleanup();
		}
	},
);
