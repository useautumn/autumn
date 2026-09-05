/**
 * atmn scenarios/motion — a fixture built by a helper or spread (`plan({ ...base, planId })`) → pull errors naming file:line and the exact edit to make, no file written
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

// Relative rather than a package import, for the same reason initAtmnScenario
// imports runPull that way: the package publishes only its bin.

test.concurrent(
	"a fixture built by a helper or spread (`plan({ ...base, planId })`) → a remote update it can't apply in place errors naming the fixture, and writes nothing",
	async () => {
		const customId = uniqueTestId("atmn_custom");

		const rootConfig = `import { custom } from "./plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({ plans: [custom] });
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"plans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";

const base = { name: "Custom", price: { amount: 20, interval: "month" as const } };
export const custom = plan({ ...base, planId: "${customId}" });
`,
			},
		});

		try {
			await scenario.push();

			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const customWire = plans.find((row) => row.plan_id === customId);
			await scenario.client.update({
				...wire,
				plans: [{ ...customWire, price: { amount: 45, interval: "month" } }],
			});

			const before = scenario.files();
			let thrown: unknown;
			try {
				await scenario.pull();
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeDefined();
			expect(String(thrown)).toContain(customId);
			expect(String(thrown)).toMatch(/plain literal/);

			// Nothing is written when a fixture can't be located.
			expect([...scenario.files().entries()]).toEqual([...before.entries()]);
		} finally {
			scenario.cleanup();
		}
	},
);
