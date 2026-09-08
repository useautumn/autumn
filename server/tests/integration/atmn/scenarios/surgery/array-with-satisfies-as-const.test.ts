/**
 * atmn scenarios/surgery — array with `satisfies` / `as const` → resolver still finds it, or errors clearly
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const MODIFIERS: Record<string, string> = {
	"as const": "as const",
	"satisfies Plan[]": `satisfies import("${CLI_PACKAGE_DIR}/src/generated/plans").Plan[]`,
};

for (const [name, modifier] of Object.entries(MODIFIERS)) {
	test.concurrent(
		`array with \`${name}\` → resolver still finds an existing fixture to update`,
		async () => {
			const planId = uniqueTestId("atmn_satisfies");

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: {
					raw: `${atmnImports()}
const corePlans = [
	plan({
		planId: "${planId}",
		name: "Pro",
		price: { amount: 20, interval: "month" },
	}),
] ${modifier};

export default atmn({
	plans: corePlans,
});
`,
				},
			});

			try {
				await scenario.push();

				await scenario.client.update({
					plans: [
						{ plan_id: planId, price: { amount: 30, interval: "month" } },
					],
					skip_deletions: false,
					migration: { draft: true },
				});

				const pulled = await scenario.pull();
				expect(pulled.replaced).toContain(`${planId}@v1`);
				expect(scenario.files().get("autumn.config.ts")).toContain(
					"amount: 30",
				);
			} finally {
				scenario.cleanup();
			}
		},
	);

	test.concurrent(
		`array with \`${name}\` → a server-only append either lands in the array or errors naming it`,
		async () => {
			const existingId = uniqueTestId("atmn_satisfies_existing");
			const newId = uniqueTestId("atmn_satisfies_new");

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: {
					raw: `${atmnImports()}
const corePlans = [
	plan({
		planId: "${existingId}",
		name: "Existing",
		price: { amount: 20, interval: "month" },
	}),
] ${modifier};

export default atmn({
	plans: corePlans,
});
`,
				},
			});

			try {
				await scenario.push();

				// A dashboard-only plan the config's `as const`/`satisfies` array
				// never mentions.
				await scenario.client.update({
					plans: [
						{
							plan_id: existingId,
							name: "Existing",
							price: { amount: 20, interval: "month" },
						},
						{
							plan_id: newId,
							name: "New",
							price: { amount: 40, interval: "month" },
						},
					],
					skip_deletions: false,
					migration: { draft: true },
				});

				const before = scenario.files();
				// Decision pending: resolveCollectionTarget's `declaresArray` check
				// looks for a bare `const name = [...]`, which a trailing type
				// modifier breaks — so the append is expected to error, naming the
				// row, rather than silently landing nowhere.
				await expect(scenario.pull()).rejects.toThrow(
					new RegExp(`plans .*${newId}.*: append to \`plans\` by hand`),
				);
				expect([...scenario.files().entries()]).toEqual([...before.entries()]);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
