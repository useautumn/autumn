/**
 * atmn crud/plans/rename — pull after each rename → the config's fixture shows the new planId, internalId unchanged, nothing else rewritten
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
				s.platform.create({ userEmail: "atmn_pull_after_rename@autumn.test" }),
			],
			config: `{
	plans: [
		plan({ planId: "free", name: "Free" }),
		plan({ planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			const before = scenario.files().get(CONFIG_PATH);
			if (before === undefined)
				throw new Error("config file missing after push");
			const freeFixture = before.slice(
				before.indexOf('planId: "free"') - 20,
				before.indexOf('planId: "pro"'),
			);
			// internalId is backfilled as the first property, immediately before
			// the planId it belongs to.
			const internalIdMatch = before.match(
				/internalId: "([^"]+)",\s*\n\s*planId: "pro"/,
			);
			if (!internalIdMatch)
				throw new Error("pro's backfilled internalId not found");
			const [, proInternalId] = internalIdMatch;

			// Renamed on the server directly (studio-style, no internalId needed
			// for this mechanism) — this dir's config still says "pro".
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

			// The untouched `free` fixture is byte-identical.
			expect(after).toContain(freeFixture);
		} finally {
			scenario.cleanup();
		}
	},
);
