/**
 * atmn scenarios/motion — fixture exported by name and listed by reference (`plans: [pro, free]`) → remote delete removes the literal, its export, its import, and the reference; remote update rewrites the literal where it is
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

const planImport = `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n`;

test.concurrent(
	"fixture exported by name and listed by reference (`plans: [pro, free]`) → a remote delete removes the literal, its export, its import, and the reference; a remote update rewrites the surviving literal in place",
	async () => {
		const proId = uniqueTestId("atmn_pro");
		const freeId = uniqueTestId("atmn_free");

		const rootConfig = `import { free, pro } from "./plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	plans: [pro, free],
});
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"plans.ts": `${planImport}
export const pro = plan({ planId: "${proId}", name: "Pro", price: { amount: 49, interval: "month" } });
export const free = plan({ planId: "${freeId}", name: "Free" });
`,
			},
		});

		try {
			await scenario.push();

			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const proWire = plans.find((row) => row.plan_id === proId);

			// `free` is dropped from the desired state entirely (a delete); `pro`
			// is restated with a changed price (an update).
			await scenario.client.update({
				...wire,
				plans: [{ ...proWire, price: { amount: 89, interval: "month" } }],
			});

			await scenario.pull();
			const files = scenario.files();
			const plansSource = files.get("plans.ts") ?? "";
			const rootSource = files.get("autumn.config.ts") ?? "";

			expect(plansSource).not.toContain(freeId);
			expect(plansSource).not.toMatch(/export const free/);
			expect(plansSource).toContain(`planId: "${proId}"`);
			expect(plansSource).toContain("amount: 89");

			expect(rootSource).not.toContain("free");
			expect(rootSource).toContain("pro");
		} finally {
			scenario.cleanup();
		}
	},
);
