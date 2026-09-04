/**
 * atmn scenarios/motion — new fixture `piss` written by hand into `bananas.ts` (feature) [and a plan into `strawberries.ts`, a version into `poo.ts`] → push creates it; the backfill seeks out that file and inserts the single `internalId` line into that fixture, nothing else in the file changes
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

const featureImport = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";\n`;
const planImport = `import { type Plan, plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n`;

const occurrencesOf = ({
	text,
	needle,
}: {
	text: string;
	needle: string;
}): number => text.split(needle).length - 1;

const TARGETS = [
	{ kind: "feature", file: "bananas.ts" },
	{ kind: "plan", file: "strawberries.ts" },
	{ kind: "version", file: "poo.ts" },
] as const;

for (const target of TARGETS) {
	test.concurrent(
		`new fixture written by hand into ${target.file} (${target.kind}) → push creates it and inserts internalId into only that fixture`,
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
				const beforeHandEdit = scenario.files();

				// A hand-edit adds ONE new fixture; it must not retype the file's
				// existing row and lose the internalId push already backfilled.
				if (target.kind === "feature") {
					const existing = beforeHandEdit.get("bananas.ts") ?? "";
					scenario.writeFile(
						"bananas.ts",
						existing.replace(
							"];\n",
							`\tfeature({ featureId: "${pissId}", name: "Piss", type: "boolean" }),\n];\n`,
						),
					);
				} else if (target.kind === "plan") {
					const existing = beforeHandEdit.get("strawberries.ts") ?? "";
					scenario.writeFile(
						"strawberries.ts",
						existing.replace(
							"];\n",
							`\tplan({ planId: "${pissId}", name: "Piss", price: { amount: 5, interval: "month" } }),\n];\n`,
						),
					);
				} else {
					// A second, older version row for the already-active `pro` plan.
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
				const after = scenario.files();

				for (const file of after.keys()) {
					if (file === target.file) continue;
					expect(after.get(file)).toEqual(beforeHandEdit.get(file));
				}

				const targetBefore = beforeHandEdit.get(target.file) ?? "";
				const targetAfter = after.get(target.file) ?? "";
				expect(
					occurrencesOf({ text: targetAfter, needle: "internalId:" }),
				).toBe(
					occurrencesOf({ text: targetBefore, needle: "internalId:" }) + 1,
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
