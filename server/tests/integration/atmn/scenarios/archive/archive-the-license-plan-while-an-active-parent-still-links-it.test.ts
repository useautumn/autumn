import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: archiving the license plan alone while the active parent still links it is refused")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "seat", versionSlug: "v1", archived: true }),
		plan({
			active: true,
			planId: "enterprise",
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", versionSlug: "v1", included: 25 }],
		}),
	],
}`,
				}),
			);

			await expect(scenario.push()).rejects.toThrow(
				/Cannot (anchor license seat to archived version v1|archive or remove seat version 1 while enterprise still links to it)/,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
