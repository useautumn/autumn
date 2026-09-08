/**
 * atmn scenarios/motion — a collection array that mixes forms (`plans: [pro, ...more, plan({...})]`) → inline fixtures edited in place, appends go to the array literal itself, references stay references
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
	"a collection array that mixes forms (`plans: [pro, ...more, plan({...})]`) → the named reference and the spread stay untouched by a remote add, and a remote update on the reference rewrites its own file",
	async () => {
		const proId = uniqueTestId("atmn_pro");
		const spreadId = uniqueTestId("atmn_spread");
		const inlineId = uniqueTestId("atmn_inline");
		const remotePlanId = uniqueTestId("atmn_remote");

		const rootConfig = `import { pro } from "./pro";
import { more } from "./more";
${planImport}
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	plans: [
		pro,
		...more,
		plan({ planId: "${inlineId}", name: "Inline", price: { amount: 5, interval: "month" } }),
	],
});
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"pro.ts": `${planImport}
export const pro = plan({ planId: "${proId}", name: "Pro", price: { amount: 49, interval: "month" } });
`,
				"more.ts": `${planImport}
export const more = [
	plan({ planId: "${spreadId}", name: "Spread", price: { amount: 15, interval: "month" } }),
];
`,
			},
		});

		try {
			await scenario.push();

			const before = scenario.files();
			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const proWire = plans.find((row) => row.plan_id === proId);

			await scenario.client.update({
				...wire,
				plans: [
					// `pro`'s row, updated in place.
					...plans.filter((row) => row.plan_id !== proId),
					{ ...proWire, price: { amount: 79, interval: "month" } },
					// A server-only row with no local fixture anywhere.
					{ plan_id: remotePlanId, name: "Remote" },
				],
			});

			await scenario.pull();
			const after = scenario.files();

			// The reference's own file is rewritten in place.
			expect(after.get("pro.ts")).not.toBe(before.get("pro.ts"));
			expect(after.get("pro.ts")).toContain("amount: 79");

			// The spread array is untouched: the append goes to the array literal,
			// not into `more`.
			expect(after.get("more.ts")).toBe(before.get("more.ts"));

			// The array literal itself (in the root config) grows by one entry,
			// while `pro` and `...more` remain plain references.
			expect(after.get("autumn.config.ts")).not.toBe(
				before.get("autumn.config.ts"),
			);
			expect(after.get("autumn.config.ts")).toContain(
				`planId: "${remotePlanId}"`,
			);
			expect(after.get("autumn.config.ts")).toContain("pro,");
			expect(after.get("autumn.config.ts")).toContain("...more,");
		} finally {
			scenario.cleanup();
		}
	},
);
