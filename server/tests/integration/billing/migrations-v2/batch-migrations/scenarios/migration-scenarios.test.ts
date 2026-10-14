import { expect, test } from "bun:test";
import { MIGRATION_SCENARIOS } from "@tests/perf/batch-migrations/scenarios/migrationScenarios";
import chalk from "chalk";
import { runMigrationScenario } from "./runMigrationScenario";

const RUN_SUFFIX = Date.now().toString(36);

for (const scenario of MIGRATION_SCENARIOS) {
	const title = `${chalk.yellowBright("migration scenario")} ${scenario.name}: ${scenario.description}`;

	if (scenario.skip) {
		test.skip(title, () => {});
		continue;
	}

	test(title, async () => {
		const outcome = await runMigrationScenario({
			scenario,
			idPrefix: `sc-${RUN_SUFFIX}-${scenario.name}`.slice(0, 44),
		});

		expect(outcome.lane).toBe(scenario.expect.lane);

		for (const code of scenario.expect.rejections ?? []) {
			expect({
				scenario: scenario.name,
				codes: outcome.rejectionCodes,
			}).toEqual({
				scenario: scenario.name,
				codes: expect.arrayContaining([code]),
			});
		}

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
