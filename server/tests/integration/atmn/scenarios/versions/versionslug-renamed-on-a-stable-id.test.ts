/**
 * atmn scenarios/versions — versionSlug renamed on a stable id → server renames the slug
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
	internalId?: string | null;
	version: number;
	versionSlug?: string | null;
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
	`${chalk.yellowBright("atmn scenarios/versions: renaming versionSlug on a stable internalId renames the slug rather than minting a new version")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{ plans: [${paidMonthly({ planId: "pro", amount: 20, extra: `\n\t\t\t\tversionSlug: "v1",` })}] }`,
		});

		try {
			await scenario.push();
			const [before] = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(before?.internalId).toBeTruthy();
			const internalId = before?.internalId as string;

			scenario.writeConfig(
				atmnConfigSource({
					body: `{ plans: [${paidMonthly({
						planId: "pro",
						amount: 20,
						extra: `\n\t\t\t\tinternalId: "${internalId}",\n\t\t\t\tnewVersionSlug: "2024-pricing",`,
					})}] }`,
				}),
			);
			await scenario.push();

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(rows).toHaveLength(1);
			expect(rows[0]).toEqual(
				expect.objectContaining({
					internalId,
					version: before?.version,
					versionSlug: "2024-pricing",
				}),
			);
		} finally {
			scenario.cleanup();
		}
	},
);
