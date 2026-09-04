/**
 * atmn scenarios/pull — server-only row → appended to the right array [inline, imported const, missing key inserted]
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

/** A minimal plan row, sent directly as a wire document to simulate the
 * server moving ahead of the config (a dashboard create, in effect). */
const serverOnlyPlanWire = ({ planId }: { planId: string }) => ({
	plans: [
		{
			plan_id: planId,
			name: "Server Plan",
			price: { amount: 20, interval: "month" },
		},
	],
	skip_deletions: false,
	migration: { draft: true },
});

const LAYOUTS = ["inline", "imported const", "missing key"] as const;

for (const layout of LAYOUTS) {
	test.concurrent(
		`server-only row → appended to the right array [${layout}]`,
		async () => {
			const planId = uniqueTestId("atmn_server_only");

			const rootConfig =
				layout === "imported const"
					? `import { corePlans } from "./corePlans";\nimport { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";\n\nexport default atmn({\n\tplans: corePlans,\n});\n`
					: layout === "inline"
						? `${atmnImports()}\nexport default atmn({\n\tplans: [],\n});\n`
						: `${atmnImports()}\nexport default atmn({});\n`;

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: { raw: rootConfig },
				files:
					layout === "imported const"
						? {
								"corePlans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n\nexport const corePlans = [];\n`,
							}
						: {},
			});

			try {
				await scenario.client.update(serverOnlyPlanWire({ planId }));

				const pulled = await scenario.pull();
				expect(pulled.appended).toContain(`${planId}@v1`);

				const files = scenario.files();
				const target =
					layout === "imported const" ? "corePlans.ts" : "autumn.config.ts";
				expect(files.get(target)).toContain(`planId: "${planId}"`);
				if (layout === "missing key")
					expect(files.get("autumn.config.ts")).toContain("plans: [");
			} finally {
				scenario.cleanup();
			}
		},
	);
}
