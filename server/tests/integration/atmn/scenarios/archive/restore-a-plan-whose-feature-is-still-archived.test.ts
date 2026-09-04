/**
 * atmn scenarios/archive — restore a plan whose feature is still archived → clean error naming the feature
 *
 * one push carries the whole batch, so restore order must not matter
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{
	features: [
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
		}),
	],
}`,
		});

		try {
			await scenario.push();

			// Archive both the plan and the feature it items on together.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	features: [feature({ featureId: "seats", archived: true })],
	plans: [plan({ planId: "pro", archived: true })],
}`,
				}),
			);
			await scenario.push();

			// Decision pending: no dedicated guard for this was found in the
			// server source at review time — this documents the intended
			// behavior (restore blocked while a referenced feature is archived,
			// error naming it) rather than a confirmed current one.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{ plans: [plan({ planId: "pro", archived: false })] }`,
				}),
			);

			await expect(scenario.push()).rejects.toThrow(/seats/i);
		} finally {
			scenario.cleanup();
		}
	},
);
