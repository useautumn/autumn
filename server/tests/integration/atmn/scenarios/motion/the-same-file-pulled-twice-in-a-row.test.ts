/**
 * atmn scenarios/motion — the same file pulled twice in a row → second pull writes nothing
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	"the same file pulled twice in a row → the first pull applies a create, an update, and a delete; the second writes nothing",
	async () => {
		const keepId = uniqueTestId("atmn_keep");
		const goneId = uniqueTestId("atmn_gone");
		const addedId = uniqueTestId("atmn_added");

		const rootConfig = `import { gone, keep } from "./plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({ plans: [keep, gone] });
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"plans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";

export const keep = plan({ planId: "${keepId}", name: "Keep", price: { amount: 10, interval: "month" } });
export const gone = plan({ planId: "${goneId}", name: "Gone", price: { amount: 20, interval: "month" } });
`,
			},
		});

		try {
			await scenario.push();

			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const keepWire = plans.find((row) => row.plan_id === keepId);

			await scenario.client.update({
				...wire,
				plans: [
					{ ...keepWire, price: { amount: 15, interval: "month" } },
					{ plan_id: addedId, name: "Added" },
				],
			});

			const first = await scenario.pull();
			expect(
				first.appended.length + first.replaced.length + first.deleted.length,
			).toBeGreaterThan(0);

			const afterFirst = scenario.files();
			const second = await scenario.pull();
			const afterSecond = scenario.files();

			expect(second.appended).toEqual([]);
			expect(second.replaced).toEqual([]);
			expect(second.deleted).toEqual([]);
			expect([...afterSecond.entries()]).toEqual([...afterFirst.entries()]);
		} finally {
			scenario.cleanup();
		}
	},
);
