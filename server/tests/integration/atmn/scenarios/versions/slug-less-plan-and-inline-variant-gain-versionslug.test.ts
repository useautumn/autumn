/**
 * atmn scenarios/versions — versionSlug is required on the plan and on each
 * `variants[]` entry. A slug-less mint is refused before any request.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: a slug-less plan and inline variant fail lint before any request")}`,
	async () => {
		const messages = uniqueTestId("atmn_messages");
		const pro = uniqueTestId("atmn_pro");
		const proYearly = `${pro}_yearly`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	features: [
		feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
	],
	plans: [
		plan({
			active: true,
			planId: "${pro}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "${messages}", included: 100, reset: { interval: "month" } }],
			variants: [
				{
					variantPlanId: "${proYearly}",
					name: "Pro Yearly",
					customize: { price: { amount: 200, interval: "year" } },
				},
			],
		}),
	],
}`,
		});

		try {
			const error = await scenario.push().catch((thrown) => thrown as Error);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain("versionSlug is required.");
			expect((error as Error).message).not.toContain("catalogV2");
		} finally {
			scenario.cleanup();
		}
	},
);
