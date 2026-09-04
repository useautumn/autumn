/**
 * atmn scenarios/motion — imports with an alias (`import { bananas as fruit }`), a `.js` specifier, a folder index, a re-exporting barrel → every append and backfill still lands in the file that holds the array
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

const featureImport = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";\n`;
const wireImport = `import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";\n`;

type Layout = {
	kind: string;
	/** Files under cwd besides autumn.config.ts. */
	files: Record<string, string>;
	/** Root import line naming the array the root references. */
	rootImport: string;
	/** File whose text actually holds the array literal. */
	ownerFile: string;
};

const bananasSource = ({ seats }: { seats: string }): string => `${featureImport}
export const bananas = [
	feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
];
`;

const layoutFor = ({
	kind,
	seats,
}: {
	kind: string;
	seats: string;
}): Layout => {
	switch (kind) {
		case "aliased import":
			return {
				kind,
				files: { "bananas.ts": bananasSource({ seats }) },
				rootImport: `import { bananas as fruit } from "./bananas";`,
				ownerFile: "bananas.ts",
			};
		case ".js specifier":
			return {
				kind,
				files: { "bananas.ts": bananasSource({ seats }) },
				rootImport: `import { bananas as fruit } from "./bananas.js";`,
				ownerFile: "bananas.ts",
			};
		case "folder index":
			return {
				kind,
				files: { "bananas/index.ts": bananasSource({ seats }) },
				rootImport: `import { bananas as fruit } from "./bananas";`,
				ownerFile: "bananas/index.ts",
			};
		default:
			return {
				kind,
				files: {
					"bananasReal.ts": bananasSource({ seats }),
					"barrel.ts": `export { bananas } from "./bananasReal";\n`,
				},
				rootImport: `import { bananas as fruit } from "./barrel";`,
				ownerFile: "bananasReal.ts",
			};
	}
};

const KINDS = [
	"aliased import",
	".js specifier",
	"folder index",
	"re-exporting barrel",
] as const;

for (const kind of KINDS) {
	test.concurrent(
		`${kind} → append and backfill land in the file that holds the array`,
		async () => {
			const seats = uniqueTestId("atmn_seats");
			const remoteFeatureId = uniqueTestId("atmn_remote_feat");
			const resolved = layoutFor({ kind, seats });

			const rootConfig = `${resolved.rootImport}
${wireImport}
export default atmn({
	features: fruit,
});
`;

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: { raw: rootConfig },
				files: resolved.files,
			});

			try {
				await scenario.push();

				const before = scenario.files();
				const wire = await scenario.wireFromConfig();
				const features = (wire.features as Record<string, unknown>[]) ?? [];
				await scenario.client.update({
					...wire,
					features: [
						...features,
						{
							feature_id: remoteFeatureId,
							name: "Remote Feature",
							type: "boolean",
						},
					],
				});

				await scenario.pull();
				const after = scenario.files();

				for (const file of after.keys()) {
					if (file === resolved.ownerFile) continue;
					expect(after.get(file)).toEqual(before.get(file));
				}
				expect(after.get(resolved.ownerFile)).not.toBe(
					before.get(resolved.ownerFile),
				);
				expect(after.get(resolved.ownerFile)).toContain(
					`featureId: "${remoteFeatureId}"`,
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
