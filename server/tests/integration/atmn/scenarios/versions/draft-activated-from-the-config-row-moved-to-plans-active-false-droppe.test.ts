/**
 * atmn scenarios/versions — draft activated from the config (row moved to plans, `active: false` dropped, old row moved to planVersions) → push switches active
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
	`${chalk.yellowBright("atmn scenarios/versions: activating a draft from the config switches which row is active")}`,
	async () => {
		const v1 = paidMonthly({
			planId: "pro",
			amount: 20,
			extra: `\n\t\t\t\tversionSlug: "v1",`,
		});
		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{ plans: [${v1}] }`,
		});

		try {
			await scenario.push();

			// v2 mints as an explicit draft alongside the still-active v1 — both
			// rows sit in `plans` while the draft is unminted, no history yet.
			const v2Draft = paidMonthly({
				planId: "pro",
				amount: 30,
				extra: `\n\t\t\t\tversionSlug: "v2",\n\t\t\t\tactive: false,`,
			});
			scenario.writeConfig(
				atmnConfigSource({ body: `{ plans: [${v1} ${v2Draft}] }` }),
			);
			await scenario.push();
			const beforeActivation = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(beforeActivation).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ versionSlug: "v1", active: true }),
					expect.objectContaining({ versionSlug: "v2", active: false }),
				]),
			);

			// Activating from the config: v2 drops `active: false`, v1 is restated
			// in planVersions — the active pointer moves and v1 becomes history.
			const v2Active = paidMonthly({
				planId: "pro",
				amount: 30,
				extra: `\n\t\t\t\tversionSlug: "v2",`,
			});
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${v2Active}],
	planVersions: [${v1}],
}`,
				}),
			);
			await scenario.push();
			const afterActivation = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(afterActivation).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ versionSlug: "v1", active: false }),
					expect.objectContaining({ versionSlug: "v2", active: true }),
				]),
			);
		} finally {
			scenario.cleanup();
		}
	},
);
