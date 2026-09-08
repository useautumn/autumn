/**
 * atmn scenarios/pull — hand layout [fixtures in separate files, `plans: corePlans` imported array, nested folders] → every edit lands in the file that holds the fixture
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

const planImport = `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";`;
const atmnImport = `import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";`;

const planLiteral = ({ planId, amount }: { planId: string; amount: number }) =>
	`plan({\n\tplanId: "${planId}",\n\tname: "Pro",\n\tprice: { amount: ${amount}, interval: "month" },\n})`;

type Layout = {
	fixtureFile: string;
	files: (planId: string) => Record<string, string>;
	root: (planId: string) => string;
};

const LAYOUTS: Record<string, Layout> = {
	"fixtures in separate files": {
		fixtureFile: "plans/pro.ts",
		files: (planId) => ({
			"plans/pro.ts": `${planImport}\n\nexport const proPlan = ${planLiteral({ planId, amount: 20 })};\n`,
		}),
		root: (_planId) =>
			`import { proPlan } from "./plans/pro";\n${atmnImport}\n\nexport default atmn({\n\tplans: [proPlan],\n});\n`,
	},
	"corePlans imported array": {
		fixtureFile: "corePlans.ts",
		files: (planId) => ({
			"corePlans.ts": `${planImport}\n\nexport const corePlans = [\n\t${planLiteral({ planId, amount: 20 })},\n];\n`,
		}),
		root: (_planId) =>
			`import { corePlans } from "./corePlans";\n${atmnImport}\n\nexport default atmn({\n\tplans: corePlans,\n});\n`,
	},
	"nested folders": {
		fixtureFile: "catalog/plans/pro.ts",
		files: (planId) => ({
			"catalog/plans/pro.ts": `${planImport}\n\nexport const proPlan = ${planLiteral({ planId, amount: 20 })};\n`,
		}),
		root: (_planId) =>
			`import { proPlan } from "./catalog/plans/pro";\n${atmnImport}\n\nexport default atmn({\n\tplans: [proPlan],\n});\n`,
	},
};

for (const [name, layout] of Object.entries(LAYOUTS)) {
	test.concurrent(
		`hand layout [${name}] → every edit lands in the file that holds the fixture`,
		async () => {
			const planId = uniqueTestId("atmn_hand_layout");

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: { raw: layout.root(planId) },
				files: layout.files(planId),
			});

			try {
				await scenario.push();
				const rootBefore = scenario.files().get("autumn.config.ts");

				await scenario.client.update({
					plans: [
						{ plan_id: planId, price: { amount: 30, interval: "month" } },
					],
					skip_deletions: false,
					migration: { draft: true },
				});

				const pulled = await scenario.pull();
				expect(pulled.replaced).toContain(`${planId}@v1`);

				const files = scenario.files();
				expect(files.get(layout.fixtureFile)).toContain("amount: 30");
				expect(files.get("autumn.config.ts")).toBe(rootBefore);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
