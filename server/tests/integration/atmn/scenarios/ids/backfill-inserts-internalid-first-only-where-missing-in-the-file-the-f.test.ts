/**
 * atmn scenarios/ids — backfill inserts `internalId` first, only where missing, in the file the fixture lives in [root, imported file, nested folder]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { atmnImports, initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const LOCATIONS = ["root", "imported file", "nested folder"] as const;
type Location = (typeof LOCATIONS)[number];

/** Where the fixture literal lives for each location kind, and the raw root
 * config that reaches it. */
const layoutFor = ({
	location,
	featureId,
}: {
	location: Location;
	featureId: string;
}): { raw: string; files: Record<string, string>; fixtureFile: string } => {
	const literal = `feature({ featureId: "${featureId}", name: "Backfill", type: "boolean" })`;

	if (location === "root") {
		return {
			raw: `${atmnImports()}
export default atmn({
	features: [
		${literal},
	],
});
`,
			files: {},
			fixtureFile: "autumn.config.ts",
		};
	}

	if (location === "imported file") {
		return {
			raw: `${atmnImports()}
import { ourFeature } from "./features.js";

export default atmn({
	features: [ourFeature],
});
`,
			files: {
				"features.ts": `${atmnImports()}
export const ourFeature = ${literal};
`,
			},
			fixtureFile: "features.ts",
		};
	}

	return {
		raw: `${atmnImports()}
import { ourFeature } from "./nested/deep/feature.js";

export default atmn({
	features: [ourFeature],
});
`,
		files: {
			"nested/deep/feature.ts": `${atmnImports()}
export const ourFeature = ${literal};
`,
		},
		fixtureFile: "nested/deep/feature.ts",
	};
};

for (const location of LOCATIONS) {
	test.concurrent(
		`${chalk.yellowBright(`atmn scenarios/ids: backfill writes internalId first, only into the file holding the fixture — ${location}`)}`,
		async () => {
			const featureId = uniqueTestId("atmn_backfill");
			const { raw, files, fixtureFile } = layoutFor({ location, featureId });

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				],
				config: { raw },
				files,
			});

			try {
				const before = scenario.files();
				await scenario.push();
				const after = scenario.files();

				for (const [path, text] of before) {
					if (path === fixtureFile) continue;
					expect(after.get(path)).toBe(text);
				}

				const fixtureText = after.get(fixtureFile) ?? "";
				expect(fixtureText).toMatch(
					new RegExp(`feature\\(\\{ internalId: "[^"]+", featureId: "${featureId}"`),
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
