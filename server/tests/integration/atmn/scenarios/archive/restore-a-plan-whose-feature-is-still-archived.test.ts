import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: restoring a plan whose item feature is still archived is refused, naming the feature")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	features: [
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			active: true,
			planId: "pro",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
		}),
	],
}`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	features: [
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false, archived: true }),
	],
	plans: [plan({ active: true, planId: "pro", versionSlug: "v1", archived: true })],
}`,
				}),
			);
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{ plans: [plan({ active: true, planId: "pro", versionSlug: "v1", archived: false })] }`,
				}),
			);

			await expect(scenario.push()).rejects.toThrow(/seats/i);
		} finally {
			scenario.cleanup();
		}
	},
);
