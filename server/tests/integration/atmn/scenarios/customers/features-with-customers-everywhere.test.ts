/**
 * atmn scenarios/customers — `features: []` with customers everywhere → every deletion becomes an archive, nothing 500s
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
import { FeatureService } from "@/internal/features/FeatureService.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

/** Two metered features and a plan holding one item over each; `keepFeatures`
 * false drops the whole `features` array and every item that used them. */
const catalogConfig = ({
	firstFeatureId,
	secondFeatureId,
	planId,
	keepFeatures,
}: {
	firstFeatureId: string;
	secondFeatureId: string;
	planId: string;
	keepFeatures: boolean;
}): string => `{
	features: [${
		keepFeatures
			? `
		feature({ featureId: "${firstFeatureId}", name: "Messages", type: "metered", consumable: true }),
		feature({ featureId: "${secondFeatureId}", name: "Seats", type: "metered", consumable: false }),`
			: ""
	}
	],
	plans: [
		{
			planId: "${planId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [${
				keepFeatures
					? `
				{ featureId: "${firstFeatureId}", included: 100, reset: { interval: "month" } },
				{ featureId: "${secondFeatureId}", included: 1 },`
					: ""
			}
			],
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: features: [] with customers everywhere archives every feature instead of 500ing")}`,
	async () => {
		const firstFeatureId = uniqueTestId("atmn_cus_all_msgs");
		const secondFeatureId = uniqueTestId("atmn_cus_all_seats");
		const planId = uniqueTestId("atmn_cus_all_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({
				firstFeatureId,
				secondFeatureId,
				planId,
				keepFeatures: true,
			}),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ firstFeatureId, secondFeatureId, planId, keepFeatures: false })});
`,
			);

			const client = createClient({
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl: scenario.baseUrl,
			});
			const result = await runPush({ client, cwd: scenario.cwd });

			for (const featureId of [firstFeatureId, secondFeatureId]) {
				const featureRow = (result.preview.features ?? []).find(
					(row) => (row as { feature_id?: string }).feature_id === featureId,
				);
				expect(featureRow).toEqual(
					expect.objectContaining({ action: "remove", will_archive: true }),
				);

				const feature = await FeatureService.get({
					db: scenario.ctx.db,
					id: featureId,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
				});
				expect(feature).toBeDefined();
				expect(feature.archived).toBe(true);
			}

			// The customer's own entitlements are untouched — deletion is a
			// catalog-level archive, not a cascade through their balances.
			const customer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			expect(customer.features?.[firstFeatureId]).toBeDefined();
			expect(customer.features?.[secondFeatureId]).toBeDefined();
		} finally {
			scenario.cleanup();
		}
	},
);
