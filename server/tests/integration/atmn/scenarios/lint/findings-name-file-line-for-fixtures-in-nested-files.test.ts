/**
 * atmn scenarios/lint — findings name file:line for fixtures in nested files
 *
 * One line of plans/atmn-v3/07_tests.md.
 */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../../../packages/atmn-nightly",
);

test("findings name file:line for fixtures in nested files", async () => {
	const featureId = uniqueTestId("atmn_lint_nested");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: {
			raw: `import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";
import { messages } from "./fixtures/nested/messages";

export default atmn({
	features: [messages],
});
`,
		},
		files: {
			// The invalid fixture (metered with no `consumable`, tripping
			// requiredWhen) lives two folders deep, not in the root config.
			"fixtures/nested/messages.ts": `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";

export const messages = feature({ featureId: "${featureId}", name: "Messages", type: "metered" });
`,
		},
	});

	try {
		// Decision pending: packages/atmn-generator/src/lint/runtime/lintDocument.ts
		// only tracks a semantic breadcrumb path today (e.g. `feature "x"`), not
		// the file and line the fixture was written at — this asserts the intended
		// behavior once a lint issue can point back to source, red is information.
		await expect(scenario.push()).rejects.toThrow(
			/fixtures\/nested\/messages\.ts:\d+/,
		);
	} finally {
		scenario.cleanup();
	}
});
