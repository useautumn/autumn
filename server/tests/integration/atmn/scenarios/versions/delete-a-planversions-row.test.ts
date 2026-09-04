/**
 * atmn scenarios/versions — delete a planVersions row → push archives it (or refuses: assert what the server does)
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

type CatalogPlanRow = { id: string; version: number; archived: boolean };

/** Every live row for a plan_id, oldest first, archived rows included. */
const livePlanRows = async ({
	client,
	planId,
}: {
	client: AutumnClient;
	planId: string;
}): Promise<CatalogPlanRow[]> => {
	const catalog = (await client.get({
		include_versions: true,
		include_archived: true,
	})) as unknown as { plans: CatalogPlanRow[] };
	return catalog.plans
		.filter((row) => row.id === planId)
		.sort((a, b) => a.version - b.version);
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: dropping a planVersions row from a stated collection archives it")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{ plans: [${paidMonthly({ planId: "pro", amount: 20 })}] }`,
		});

		try {
			await scenario.push();

			// Mint v2, restating v1 in planVersions — history now has one row.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}],
	planVersions: [${paidMonthly({ planId: "pro", amount: 20, extra: `\n\t\t\t\tversionSlug: "v1",` })}],
}`,
				}),
			);
			await scenario.push();
			expect(
				await livePlanRows({ client: scenario.client, planId: "pro" }),
			).toEqual([
				expect.objectContaining({ version: 1, archived: false }),
				expect.objectContaining({ version: 2, archived: false }),
			]);

			// Decision pending: dropping the v1 row from a stated `planVersions`
			// collection asks the server to remove it. computeRemoveProductsPlan
			// stamps absentee rows `willArchive`, so the intended outcome is a
			// soft archive of v1 rather than a refusal.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}],
	planVersions: [],
}`,
				}),
			);
			await scenario.push();

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			// An unused version is removed outright; only a held one is archived.
			const v1 = rows.find((row) => row.version === 1);
			expect(v1 === undefined || v1.archived).toBe(true);
			expect(rows.find((row) => row.version === 2)?.archived).toBe(false);
		} finally {
			scenario.cleanup();
		}
	},
);
