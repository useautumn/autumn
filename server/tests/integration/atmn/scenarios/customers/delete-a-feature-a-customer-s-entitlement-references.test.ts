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
	featureId,
	planId,
	includeFeature,
}: {
	featureId: string;
	planId: string;
	includeFeature: boolean;
}): string => `{
	features: [${
		includeFeature
			? `
		feature({ featureId: "${featureId}", name: "Messages", type: "metered", consumable: true }),`
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
			items: [${includeFeature ? `{ featureId: "${featureId}", included: 100, reset: { interval: "month" } }` : ""}],
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: deleting a feature a customer's entitlement references archives it instead of deleting it")}`,
	async () => {
		const featureId = uniqueTestId("atmn_cus_feat");
		const planId = uniqueTestId("atmn_cus_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({ featureId, planId, includeFeature: true }),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ featureId, planId, includeFeature: false })});
`,
			);

			const client = createClient({
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl: scenario.baseUrl,
			});
			const result = await runPush({ client, cwd: scenario.cwd });

			const featureRow = (result.preview.features ?? []).find(
				(row) => (row as { featureId?: string }).featureId === featureId,
			);
			expect(featureRow).toEqual(
				expect.objectContaining({
					action: "delete",
					state: expect.objectContaining({
						hasCustomers: true,
						willArchive: true,
					}),
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
		} finally {
			scenario.cleanup();
		}
	},
);
