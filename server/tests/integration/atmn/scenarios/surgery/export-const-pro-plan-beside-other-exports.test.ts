/**
 * atmn scenarios/surgery — `export const pro = plan({})` beside other exports → only that declaration goes, unused imports pruned
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

test.concurrent(
	"`export const pro = plan({})` beside other exports → only that declaration goes, unused imports pruned",
	async () => {
		const proId = uniqueTestId("atmn_export_pro");
		const freeId = uniqueTestId("atmn_export_free");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: {
				raw: `import { pro, free } from "./plans";\nimport { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";\n\nexport default atmn({\n\tplans: [pro, free],\n});\n`,
			},
			files: {
				"plans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";

export const pro = plan({
	planId: "${proId}",
	name: "Pro",
	price: { amount: 20, interval: "month" },
});

export const free = plan({
	planId: "${freeId}",
	name: "Free",
});
`,
			},
		});

		try {
			// Seed `free` directly, bypassing the CLI: it must already match the
			// server so its preview action is "none", leaving `pro` — never pushed
			// — as the only "create" pull has to reverse.
			await scenario.client.update({
				plans: [{ plan_id: freeId, name: "Free" }],
				skip_deletions: false,
				migration: { draft: true },
			});

			const pulled = await scenario.pull();
			expect(pulled.deleted).toContain(proId);

			const files = scenario.files();
			const plans = files.get("plans.ts") ?? "";
			expect(plans).not.toContain("export const pro");
			expect(plans).not.toContain(proId);
			expect(plans).toContain("export const free");
			expect(plans).toContain(freeId);

			const root = files.get("autumn.config.ts") ?? "";
			expect(root).not.toContain("{ pro, free }");
			expect(root).toContain('import { free } from "./plans"');
			expect(root).toContain("plans: [free]");
		} finally {
			scenario.cleanup();
		}
	},
);
