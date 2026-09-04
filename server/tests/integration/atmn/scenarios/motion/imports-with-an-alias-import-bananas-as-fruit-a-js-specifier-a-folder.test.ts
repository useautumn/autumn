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
	type AtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
// Relative rather than a package import, for the same reason initAtmnScenario
// imports runPull that way: the package publishes only its bin.
import { UnlocatableFixturesError } from "../../../../../../packages/atmn-nightly/src/actions/pull";

const featureImport = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";\n`;
const wireImport = `import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";\n`;

type Layout = {
	kind: string;
	/** Whether the resolver is expected to follow the root import (TypeScript-only resolution). */
	resolvable: boolean;
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

const layoutFor = ({ kind, seats }: { kind: string; seats: string }): Layout => {
	switch (kind) {
		case "aliased import":
			return {
				kind,
				resolvable: true,
				files: { "bananasAliased.ts": bananasSource({ seats }) },
				rootImport: `import { bananas as fruit } from "./bananasAliased";`,
				ownerFile: "bananasAliased.ts",
			};
		case ".js specifier":
			return {
				kind,
				resolvable: false,
				files: { "bananasJs.ts": bananasSource({ seats }) },
				rootImport: `import { bananas as fruit } from "./bananasJs.js";`,
				ownerFile: "bananasJs.ts",
			};
		case "folder index":
			return {
				kind,
				resolvable: true,
				files: { "bananasFolder/index.ts": bananasSource({ seats }) },
				rootImport: `import { bananas as fruit } from "./bananasFolder";`,
				ownerFile: "bananasFolder/index.ts",
			};
		default:
			return {
				kind,
				resolvable: false,
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

// One org per file: pushing each cell's config archives the previous cell's
// rows, so cells can share one scenario when run sequentially.
let scenarioPromise: Promise<AtmnScenario> | null = null;
const getScenario = (): Promise<AtmnScenario> => {
	if (scenarioPromise === null) {
		scenarioPromise = initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: { raw: `${wireImport}\nexport default atmn({});\n` },
		});
	}
	return scenarioPromise;
};

for (const kind of KINDS) {
	test(
		`${kind} → append and backfill land in the file that holds the array`,
		async () => {
			const seats = uniqueTestId("atmn_seats");
			const remoteFeatureId = uniqueTestId("atmn_remote_feat");
			const layout = layoutFor({ kind, seats });

			const rootConfig = `${layout.rootImport}
${wireImport}
export default atmn({
	features: fruit,
});
`;

			const scenario = await getScenario();
			for (const [relativePath, source] of Object.entries(layout.files)) {
				scenario.writeFile(relativePath, source);
			}
			scenario.writeConfig(rootConfig);

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

				if (!layout.resolvable) {
				// `.js` specifiers and re-exporting barrels are out of scope for
				// the TypeScript-only resolver: pull must refuse, naming the collection.
					let thrown: unknown;
					try {
						await scenario.pull();
					} catch (error) {
						thrown = error;
					}
					expect(thrown).toBeInstanceOf(UnlocatableFixturesError);
					expect(String(thrown)).toContain("features");
					expect(String(thrown)).toContain(remoteFeatureId);
					// A refused pull writes nothing.
					expect([...scenario.files().entries()]).toEqual([...before.entries()]);
					return;
				}

				await scenario.pull();
				const after = scenario.files();

				for (const file of Object.keys(layout.files)) {
					if (file === layout.ownerFile) continue;
					expect(after.get(file)).toEqual(before.get(file));
				}
				expect(after.get("autumn.config.ts")).toBe(before.get("autumn.config.ts"));
				expect(after.get(layout.ownerFile)).not.toBe(before.get(layout.ownerFile));
				expect(after.get(layout.ownerFile)).toContain(
					`featureId: "${remoteFeatureId}"`,
				);
				expect(after.get(layout.ownerFile)).toContain("internalId:");
			} finally {
				if (kind === KINDS[KINDS.length - 1]) scenario.cleanup();
			}
		},
	);
}
