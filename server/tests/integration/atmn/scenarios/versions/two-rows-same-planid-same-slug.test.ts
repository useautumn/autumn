/**
 * atmn scenarios/versions — two rows same planId same slug → lint `unique`, no request
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: two rows declaring the same planId and versionSlug are rejected locally, no request")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		${paidMonthly({ planId: "pro", amount: 20, versionSlug: "v1", active: true })}
		${paidMonthly({ planId: "pro", amount: 30, versionSlug: "v1", active: false })}
	],
}`,
		});

		try {
			await expect(scenario.push()).rejects.toThrow(/is used more than once/);
		} finally {
			scenario.cleanup();
		}
	},
);
