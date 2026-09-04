/**
 * atmn scenarios/motion — comments inside a fixture literal → survive an in-place rewrite of that fixture (or: are lost, assert which and make it deliberate)
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
	"comments inside a fixture literal do not survive a remote-driven in-place rewrite of that fixture",
	async () => {
		const proId = uniqueTestId("atmn_pro");
		const comment =
			"// pricing set by finance, don't change without approval";

		const rootConfig = `import { pro } from "./plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({ plans: [pro] });
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"plans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";

export const pro = plan({
	planId: "${proId}",
	${comment}
	name: "Pro",
	price: { amount: 49, interval: "month" },
});
`,
			},
		});

		try {
			await scenario.push();
			expect(scenario.files().get("plans.ts")).toContain(comment);

			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const proWire = plans.find((row) => row.plan_id === proId);
			await scenario.client.update({
				...wire,
				plans: [{ ...proWire, price: { amount: 59, interval: "month" } }],
			});

			await scenario.pull();
			const after = scenario.files().get("plans.ts") ?? "";

			expect(after).toContain("amount: 59");
			// Decision pending: an in-place rewrite replaces the whole fixture
			// node, so a comment attached inside it is dropped rather than
			// re-attached to the new text.
			expect(after).not.toContain(comment);
		} finally {
			scenario.cleanup();
		}
	},
);
