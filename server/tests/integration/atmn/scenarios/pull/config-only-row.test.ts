/**
 * atmn scenarios/pull — config-only row → literal, export, import line, and array entry all removed
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
	"config-only row → literal, export, import line, and array entry all removed",
	async () => {
		const planId = uniqueTestId("atmn_config_only");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: {
				raw: `import { proPlan } from "./plans";\nimport { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";\n\nexport default atmn({\n\tplans: [proPlan],\n});\n`,
			},
			files: {
				"plans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n\nexport const proPlan = plan({\n\tplanId: "${planId}",\n\tname: "Pro",\n\tprice: { amount: 20, interval: "month" },\n});\n`,
			},
		});

		try {
			// The plan is never pushed: it exists only in the config, so preview
			// reports `action: "create"`, which pull reverses as a config edit.
			const pulled = await scenario.pull();
			expect(pulled.deleted).toContain(planId);

			const files = scenario.files();
			expect(files.get("plans.ts")).not.toContain("proPlan");
			expect(files.get("plans.ts")).not.toContain(planId);
			expect(files.get("autumn.config.ts")).not.toContain("proPlan");
			expect(files.get("autumn.config.ts")).not.toContain("./plans");
		} finally {
			scenario.cleanup();
		}
	},
);
