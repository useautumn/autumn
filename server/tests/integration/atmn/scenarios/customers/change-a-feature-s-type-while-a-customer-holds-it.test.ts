import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";

const catalogConfig = ({
	featureId,
	planId,
	featureType,
}: {
	featureId: string;
	planId: string;
	featureType: "metered" | "boolean";
}): string => `{
	features: [
		feature({ featureId: "${featureId}", name: "Messages", type: "${featureType}"${featureType === "metered" ? ", consumable: true" : ""} }),
	],
	plans: [
		{
			planId: "${planId}",
			active: true,
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "${featureId}" }],
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: changing a feature's type while a customer holds it is refused")}`,
	async () => {
		const featureId = uniqueTestId("atmn_cus_type_feat");
		const planId = uniqueTestId("atmn_cus_type_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({ featureId, planId, featureType: "metered" }),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ featureId, planId, featureType: "boolean" })});
`,
			);

			await expect(scenario.push()).rejects.toThrow();

			const feature = await FeatureService.get({
				db: scenario.ctx.db,
				id: featureId,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			});
			expect(feature?.type).toBe(FeatureType.Metered);
		} finally {
			scenario.cleanup();
		}
	},
);
