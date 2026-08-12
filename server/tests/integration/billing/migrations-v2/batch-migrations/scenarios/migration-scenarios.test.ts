/**
 * Every scenario in the table, run end to end against the production migration
 * path. A new edge case is a row in MIGRATION_SCENARIOS, not a new file.
 *
 * Rejection rows are as load-bearing as the rest: they pin which shapes the
 * set-based lane refuses, so a guard cannot quietly stop firing.
 */
import { expect, test } from "bun:test";
import { MIGRATION_SCENARIOS } from "@tests/perf/batch-migrations/scenarios/migrationScenarios";
import chalk from "chalk";
import { runMigrationScenario } from "./runMigrationScenario";

for (const scenario of MIGRATION_SCENARIOS) {
	const title = `${chalk.yellowBright("migration scenario")} ${scenario.name}: ${scenario.description}`;

	if (scenario.skip) {
		test.skip(title, () => {});
		continue;
	}

	test(title, async () => {
		const outcome = await runMigrationScenario({
			scenario,
			idPrefix: `sc-${scenario.name}`.slice(0, 40),
		});

		expect(outcome.lane).toBe(scenario.expect.lane);

		for (const [featureId, expected] of Object.entries(
			scenario.expect.rowsPerTarget ?? {},
		)) {
			expect({
				feature: featureId,
				rows: outcome.rowsByFeature[featureId] ?? 0,
			}).toEqual({ feature: featureId, rows: expected });
		}

		for (const [featureId, expected] of Object.entries(
			scenario.expect.balance ?? {},
		)) {
			expect({
				feature: featureId,
				balance: outcome.balanceByFeature[featureId],
			}).toEqual({ feature: featureId, balance: expected });
		}

		for (const featureId of scenario.expect.untouched ?? []) {
			expect({
				feature: featureId,
				present: (outcome.rowsByFeature[featureId] ?? 0) > 0,
			}).toEqual({ feature: featureId, present: true });
		}
	});
}
