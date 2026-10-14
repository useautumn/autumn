import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnClient } from "../../../../../../packages/atmn/src/generated/client";

type CatalogPlanRow = { id: string; version: number; archived: boolean };

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
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ plans: [${paidMonthly({ planId: "pro", amount: 20 })}] }`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}${paidMonthly({ planId: "pro", amount: 20, active: false, extra: `\n\t\t\t\tversionSlug: "v1",` })}],
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

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}],
}`,
				}),
			);
			await scenario.push();

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			const v1 = rows.find((row) => row.version === 1);
			expect(v1 === undefined || v1.archived).toBe(true);
			expect(rows.find((row) => row.version === 2)?.archived).toBe(false);
		} finally {
			scenario.cleanup();
		}
	},
);
