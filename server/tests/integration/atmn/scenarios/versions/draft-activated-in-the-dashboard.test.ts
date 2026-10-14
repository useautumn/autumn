import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type WirePlanRow = Record<string, unknown>;

const findPlan = ({
	rows,
	versionSlug,
}: {
	rows: WirePlanRow[];
	versionSlug: string;
}): WirePlanRow | undefined =>
	rows.find((row) => row.version_slug === versionSlug);

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: a draft activated outside the CLI pulls the old active row into planVersions")}`,
	async () => {
		const v1 = paidMonthly({
			planId: "pro",
			amount: 20,
			versionSlug: "v1",
		});
		const v2Draft = paidMonthly({
			planId: "pro",
			amount: 30,
			active: false,
			versionSlug: "v2",
		});
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ plans: [${v1}] }`,
		});

		try {
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${v1} ${v2Draft}],
}`,
				}),
			);
			await scenario.push();

			await scenario.client.update({
				plans: [{ plan_id: "pro", version_slug: "v2", active: true }],
				migration: { draft: true },
			});

			await scenario.pull();

			const wire = (await scenario.wireFromConfig()) as {
				plans?: WirePlanRow[];
			};
			const plans = wire.plans ?? [];

			expect(findPlan({ rows: plans, versionSlug: "v2" })).toEqual(
				expect.objectContaining({ active: true }),
			);
			expect(findPlan({ rows: plans, versionSlug: "v1" })).toEqual(
				expect.objectContaining({ active: false }),
			);

			const dry = await scenario.push({ dryRun: true });
			expect(dry.output).toContain("No changes");
		} finally {
			scenario.cleanup();
		}
	},
);
