/**
 * atmn scenarios/lint — config that throws at import [syntax error, missing import] → readable error, no request
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
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

/**
 * A raw autumn.config.ts that fails before `atmn(...)` ever runs — either a
 * parse error, or a reference to a builder nothing imported.
 */
const brokenConfigSource = ({
	kind,
}: {
	kind: "syntax error" | "missing import";
}): string => {
	if (kind === "syntax error") {
		return `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	features: [
		feature({ featureId: "x", name: "X", type: "boolean"
`;
	}
	// atmn is never imported, so calling it throws a ReferenceError at module eval.
	return `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";

export default atmn({
	features: [
		feature({ featureId: "x", name: "X", type: "boolean" }),
	],
});
`;
};

for (const kind of ["syntax error", "missing import"] as const) {
	test(`config that throws at import [${kind}] → readable error, no request`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: brokenConfigSource({ kind }) },
		});

		try {
			await expect(scenario.push()).rejects.toThrow();

			// Nothing was ever sent: the org's catalog stays empty.
			const catalog = (await scenario.client.get({})) as unknown as {
				features: Array<{ id: string }>;
				plans: Array<{ id: string }>;
			};
			expect(catalog.features.some((row) => row.id === "x")).toBe(false);
			expect(catalog.plans).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	});
}
