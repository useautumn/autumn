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

type CatalogPlanRow = {
	id: string;
	version: number;
	versionSlug?: string | null;
	active?: boolean;
};
type WirePlanRow = Record<string, unknown>;

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
	`${chalk.yellowBright("atmn scenarios/versions: v1 pushed after v2 gets the higher creation-order number, and pull keeps it in planVersions rather than surfacing it as a draft")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ plans: [${paidMonthly({ planId: "pro", amount: 30, extra: `\n\t\t\t\tversionSlug: "v2",` })}] }`,
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

			const rows = await livePlanRows({
				client: scenario.client,
				planId: "pro",
			});
			expect(rows.find((row) => row.versionSlug === "v2")).toEqual(
				expect.objectContaining({ version: 1, active: true }),
			);
			expect(rows.find((row) => row.versionSlug === "v1")).toEqual(
				expect.objectContaining({ version: 2, active: false }),
			);

			await scenario.pull();

			const wire = (await scenario.wireFromConfig()) as {
				plans?: WirePlanRow[];
			};
			const plans = wire.plans ?? [];

			expect(plans.find((row) => row.version_slug === "v1")).toEqual(
				expect.objectContaining({ active: false }),
			);
			expect(plans.find((row) => row.version_slug === "v2")).toEqual(
				expect.objectContaining({ active: true }),
			);
		} finally {
			scenario.cleanup();
		}
	},
);
