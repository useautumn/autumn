import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { renamePlan } from "../../../../catalog-v2/plans/utils/planAliasTestUtils.js";

const CONFIG_PATH = "autumn.config.ts";

test.concurrent(
	`${chalk.yellowBright("pull after each rename → the config's fixture shows the new planId, internalId unchanged, nothing else rewritten")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "free", name: "Free", versionSlug: "v1", }),
		plan({ active: true, planId: "pro", name: "Pro", versionSlug: "v1", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			await scenario.pull();
			const before = scenario.files().get(CONFIG_PATH);
			if (before === undefined)
				throw new Error("config file missing after push");
			const freeFixture = before.slice(
				before.indexOf('planId: "free"') - 20,
				before.indexOf('planId: "pro"'),
			);
			const internalIdMatch = before.match(
				/internalId: "([^"]+)",\s+active: true,\s+planId: "pro"/,
			);
			if (!internalIdMatch)
				throw new Error("pro's backfilled internalId not found");
			const [, proInternalId] = internalIdMatch;

			await renamePlan({
				autumn: scenario.autumnV2_3,
				fromId: "pro",
				toId: "proNew",
			});

			await scenario.pull();

			const after = scenario.files().get(CONFIG_PATH);
			if (after === undefined)
				throw new Error("config file missing after pull");

			expect(after).toContain('planId: "proNew"');
			expect(after).not.toContain('planId: "pro"');
			expect(after).toContain(`internalId: "${proInternalId}"`);

			expect(after).toContain(freeFixture);
		} finally {
			scenario.cleanup();
		}
	},
);
