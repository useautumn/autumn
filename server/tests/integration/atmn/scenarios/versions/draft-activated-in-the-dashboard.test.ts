/**
 * atmn scenarios/versions — draft activated in the dashboard → pull moves it to plans and the old active row into planVersions
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
			extra: `\n\t\t\t\tversionSlug: "v1",`,
		});
		const v2Draft = paidMonthly({
			planId: "pro",
			amount: 30,
			extra: `\n\t\t\t\tversionSlug: "v2",\n\t\t\t\tactive: false,`,
		});
		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
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

			// "In the dashboard": flip the draft active directly through the API,
			// never touching the CLI's config file.
			await scenario.client.update({
				plans: [{ plan_id: "pro", version_slug: "v2", active: true }],
				migration: { draft: true },
			});

			await scenario.pull();

			// Membership is state: the wire has one `plans` array, and `active`
			// on each row is what says plans vs planVersions — not a separate key.
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

			// The pull already caught up with the dashboard change, so a dry-run
			// push against the refreshed config previews nothing further.
			const dry = await scenario.push({ dryRun: true });
			expect(dry.output).toContain("No changes");
		} finally {
			scenario.cleanup();
		}
	},
);
