import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { runPush } from "../../../../../../packages/atmn/src/actions/push";
import { createClient } from "../../../../../../packages/atmn/src/generated/client";

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
			active: true,
			name: "Pro",
			versionSlug: "v1",
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
					(row) => (row as { featureId?: string }).featureId === featureId,
				);
				expect(featureRow).toEqual(
					expect.objectContaining({
						action: "delete",
						state: expect.objectContaining({ willArchive: true }),
					}),
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

			const customer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			// @ts-expect-error autumnV2_3's declared return type defaults to ApiCustomerV3; this API version actually returns subscriptions/balances
			expect(customer.balances?.[firstFeatureId]).toBeDefined();
			// @ts-expect-error autumnV2_3's declared return type defaults to ApiCustomerV3; this API version actually returns subscriptions/balances
			expect(customer.balances?.[secondFeatureId]).toBeDefined();
		} finally {
			scenario.cleanup();
		}
	},
);
