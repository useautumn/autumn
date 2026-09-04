/**
 * atmn scenarios/archive — restore a versioned plan [only the active version, every version] → assert what the server does
 *
 * one push carries the whole batch, so restore order must not matter
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
	archived: boolean;
};

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
	return catalog.plans.filter((row) => row.id === planId);
};

const archiveBothVersions = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof initAtmnScenario>>;
}): Promise<void> => {
	scenario.writeConfig(
		atmnConfigSource({
			body: `{
	plans: [plan({ planId: "pro", versionSlug: "v2", archived: true })],
	planVersions: [plan({ planId: "pro", versionSlug: "v1", archived: true })],
}`,
		}),
	);
	await scenario.push();
};

const setUpTwoArchivedVersions = async (): Promise<
	Awaited<ReturnType<typeof initAtmnScenario>>
> => {
	const scenario = await initAtmnScenario({
		setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
		config: `{ plans: [${paidMonthly({ planId: "pro", amount: 20, extra: `\n\t\t\t\tversionSlug: "v1",` })}] }`,
	});
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
	await archiveBothVersions({ scenario });
	return scenario;
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: restoring only the active version leaves the inactive one archived")}`,
	async () => {
		const scenario = await setUpTwoArchivedVersions();

		try {
			// Decision pending: planVersions is omitted, leaving v1 untouched —
			// the intended reading of "omit a key to leave that collection alone".
			scenario.writeConfig(
				atmnConfigSource({
					body: `{ plans: [plan({ planId: "pro", versionSlug: "v2", archived: false })] }`,
				}),
			);
			await scenario.push();

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(rows.find((row) => row.versionSlug === "v2")?.archived).toBe(
				false,
			);
			expect(rows.find((row) => row.versionSlug === "v1")?.archived).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: restoring every version restores both rows")}`,
	async () => {
		const scenario = await setUpTwoArchivedVersions();

		try {
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [plan({ planId: "pro", versionSlug: "v2", archived: false })],
	planVersions: [plan({ planId: "pro", versionSlug: "v1", archived: false })],
}`,
				}),
			);
			await scenario.push();

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(rows.find((row) => row.versionSlug === "v2")?.archived).toBe(
				false,
			);
			expect(rows.find((row) => row.versionSlug === "v1")?.archived).toBe(
				false,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
