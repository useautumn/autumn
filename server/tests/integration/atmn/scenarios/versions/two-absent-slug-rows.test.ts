/**
 * atmn scenarios/versions — two absent-slug rows → both are v1 → lint `unique`
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
	`${chalk.yellowBright("atmn scenarios/versions: two rows for one plan that both omit versionSlug collide on the implicit v1, and lint refuses before any request")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			// Decision pending: neither row states versionSlug, so both default to
			// the same implicit v1 — the `unique` lint rule that already guards
			// featureId is the intended guard here too; the plans rule set doesn't
			// carry it yet, so this may currently reach the server instead.
			config: `{
	plans: [
		${paidMonthly({ planId: "pro", amount: 20 })}
		${paidMonthly({ planId: "pro", amount: 30 })}
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
