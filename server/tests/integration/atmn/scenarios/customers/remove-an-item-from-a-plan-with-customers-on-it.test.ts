/**
 * atmn scenarios/customers — remove an item from a plan with customers on it → in place, migration drafted, entitlements untouched until migrated
 *
 * real `billing.attach` first; the point is to hit the dependency errors
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

/** A plan with two items over two metered features; `dropSecondItem` removes
 * the second one in place, keeping the plan's own row. */
const catalogConfig = ({
	firstFeatureId,
	secondFeatureId,
	planId,
	dropSecondItem,
}: {
	firstFeatureId: string;
	secondFeatureId: string;
	planId: string;
	dropSecondItem: boolean;
}): string => `{
	features: [
		feature({ featureId: "${firstFeatureId}", name: "Messages", type: "metered", consumable: true }),
		feature({ featureId: "${secondFeatureId}", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		{
			planId: "${planId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [
				{ featureId: "${firstFeatureId}", included: 100, reset: { interval: "month" } },${
					dropSecondItem
						? ""
						: `
				{ featureId: "${secondFeatureId}", included: 1 },`
				}
			],
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: removing an item from a customered plan drafts a migration and leaves entitlements untouched")}`,
	async () => {
		const firstFeatureId = uniqueTestId("atmn_cus_item_msgs");
		const secondFeatureId = uniqueTestId("atmn_cus_item_seats");
		const planId = uniqueTestId("atmn_cus_item_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({
				firstFeatureId,
				secondFeatureId,
				planId,
				dropSecondItem: false,
			}),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ firstFeatureId, secondFeatureId, planId, dropSecondItem: true })});
`,
			);

			const client = createClient({
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl: scenario.baseUrl,
			});
			const result = await runPush({ client, cwd: scenario.cwd });

			const planRow = (result.preview.plans ?? []).find(
				(row) => (row as { plan_id?: string }).plan_id === planId,
			);
			expect(planRow).toEqual(expect.objectContaining({ action: "update" }));
			expect(result.preview.migrations ?? []).not.toHaveLength(0);
			expect(result.migrationIds).not.toHaveLength(0);

			const [migration] = await migrationRepo.get({
				ctx: scenario.ctx,
				id: result.migrationIds[0],
			});
			expect(migration).toBeDefined();
			expect(migration.archived).toBe(false);

			// A draft doesn't run anything: the customer's entitlement for the
			// removed feature is still there until the migration is executed.
			const customer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			expect(customer.features?.[secondFeatureId]).toBeDefined();
		} finally {
			scenario.cleanup();
		}
	},
);
