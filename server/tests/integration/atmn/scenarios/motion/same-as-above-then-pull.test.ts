/**
 * atmn scenarios/motion — same as above, then pull → nothing to do, every file byte-identical
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 *
 * "Above" is the previous matrix line: a fixture written by hand into
 * `bananas.ts`/`strawberries.ts`/`poo.ts`, then pushed. Push already backfills
 * that fixture's `internalId`, so a follow-up pull has nothing left to do.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const featureImport = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";\n`;
const planImport = `import { type Plan, plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n`;

const TARGETS = [
	{ kind: "feature", file: "bananas.ts" },
	{ kind: "plan", file: "strawberries.ts" },
	{ kind: "version", file: "poo.ts" },
] as const;

for (const target of TARGETS) {
	test.concurrent(
		`same as above (a hand-written fixture pushed into ${target.file}), then pull → nothing to do, every file byte-identical`,
		async () => {
			const seats = uniqueTestId("atmn_seats");
			const pro = uniqueTestId("atmn_pro");
			const pissId = uniqueTestId("atmn_piss");

			const rootConfig = `import { bananas } from "./bananas";
import { strawberries } from "./strawberries";
import { poo } from "./poo";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	features: bananas,
	plans: strawberries,
	planVersions: poo,
});
`;

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: { raw: rootConfig },
				files: {
					"bananas.ts": `${featureImport}
export const bananas = [
	feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
];
`,
					"strawberries.ts": `${planImport}
export const strawberries: Plan[] = [
	plan({ planId: "${pro}", name: "Pro", versionSlug: "v1", price: { amount: 49, interval: "month" } }),
];
`,
					"poo.ts": `${planImport}
export const poo: Plan[] = [];
`,
				},
			});

			try {
				await scenario.push();

				// A hand-edit adds ONE row to the file push already backfilled;
				// it must not retype the existing row and lose its internalId.
				const afterFirstPush = scenario.files();

				if (target.kind === "feature") {
					const existing = afterFirstPush.get("bananas.ts") ?? "";
					scenario.writeFile(
						"bananas.ts",
						existing.replace(
							"];\n",
							`\tfeature({ featureId: "${pissId}", name: "Piss", type: "boolean" }),\n];\n`,
						),
					);
				} else if (target.kind === "plan") {
					const existing = afterFirstPush.get("strawberries.ts") ?? "";
					scenario.writeFile(
						"strawberries.ts",
						existing.replace(
							"];\n",
							`\tplan({ planId: "${pissId}", name: "Piss", price: { amount: 5, interval: "month" } }),\n];\n`,
						),
					);
				} else {
					scenario.writeFile(
						"poo.ts",
						`${planImport}
export const poo: Plan[] = [
	plan({ planId: "${pro}", name: "Pro", versionSlug: "v0", price: { amount: 39, interval: "month" } }),
];
`,
					);
				}
				await scenario.push();

				const before = scenario.files();
				const pulled = await scenario.pull();
				const after = scenario.files();

				expect(pulled.appended).toEqual([]);
				expect(pulled.replaced).toEqual([]);
				expect(pulled.deleted).toEqual([]);
				expect([...after.entries()]).toEqual([...before.entries()]);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
