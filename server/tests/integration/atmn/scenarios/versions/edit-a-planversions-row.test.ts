/**
 * atmn scenarios/versions — edit a planVersions row → push updates that inactive version in place, no new version
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
import type { AutumnClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

type CatalogPlanRow = {
	id: string;
	versionSlug?: string | null;
	active?: boolean;
	price: { amount: number } | null;
};

const livePlanRows = async ({
	client,
	planId,
}: {
	client: AutumnClient;
	planId: string;
}): Promise<CatalogPlanRow[]> => {
	const catalog = (await client.get({ include_versions: true })) as unknown as {
		plans: CatalogPlanRow[];
	};
	return catalog.plans.filter((row) => row.id === planId);
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: editing a planVersions row updates that inactive row in place")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{ plans: [${paidMonthly({ planId: "pro", amount: 20, extra: `\n\t\t\t\tversionSlug: "v1",` })}] }`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}],
	planVersions: [${paidMonthly({ planId: "pro", amount: 20, extra: `\n\t\t\t\tversionSlug: "v1",` })}],
}`,
				}),
			);
			await scenario.push();

			// Edit the inactive v1 row in place — same versionSlug, new price.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}],
	planVersions: [${paidMonthly({ planId: "pro", amount: 25, extra: `\n\t\t\t\tversionSlug: "v1",` })}],
}`,
				}),
			);
			await scenario.push();

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(rows).toHaveLength(2);
			expect(rows.find((row) => row.versionSlug === "v1")).toEqual(
				expect.objectContaining({
					active: false,
					price: expect.objectContaining({ amount: 25 }),
				}),
			);
			expect(rows.find((row) => row.versionSlug === "v2")).toEqual(
				expect.objectContaining({
					active: true,
					price: expect.objectContaining({ amount: 30 }),
				}),
			);

			// Idempotent: re-pushing the same edit previews nothing further.
			const dry = await scenario.push({ dryRun: true });
			expect(dry.output).toContain("No changes");
		} finally {
			scenario.cleanup();
		}
	},
);
