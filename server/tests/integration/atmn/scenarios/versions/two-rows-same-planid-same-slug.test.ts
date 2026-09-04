/**
 * atmn scenarios/versions — two rows same planId same slug → lint `unique`, no request
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ConfigError } from "../../../../../../packages/atmn-nightly/src/generated/lintRuntime";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: two rows declaring the same planId and versionSlug are rejected locally, no request")}`,
	async () => {
		const row = (amount: number): string =>
			paidMonthly({
				planId: "pro",
				amount,
				extra: `\n\t\t\t\tversionSlug: "v1",`,
			});

		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			// Decision pending: same guard as two-absent-slug-rows — the `unique`
			// lint rule kind exists for featureId already; the plans rule set
			// doesn't declare a composite (planId, versionSlug) rule yet.
			config: `{
	plans: [
		${row(20)}
		${row(30)}
	],
}`,
		});

		try {
			await expect(scenario.push()).rejects.toThrow(ConfigError);
		} finally {
			scenario.cleanup();
		}
	},
);
