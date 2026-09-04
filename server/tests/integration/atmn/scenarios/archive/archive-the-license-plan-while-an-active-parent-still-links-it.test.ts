/**
 * atmn scenarios/archive — archive the license plan while an active parent still links it → server refuses, error surfaced
 *
 * one push carries the whole batch, so restore order must not matter
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
		});

		try {
			await scenario.push();

			// A push states the whole plans collection, so the still-active parent
			// must be restated too or it is removed outright rather than left
			// alone; restating its license link while seat archives in the same
			// call trips the link-time guard first — still the server refusing an
			// active plan pointing at an archived license plan.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "seat", archived: true }),
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", included: 25 }],
		}),
	],
}`,
				}),
			);

			await expect(scenario.push()).rejects.toThrow(
				/seat.*archived.*(cannot be linked|links)/i,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
