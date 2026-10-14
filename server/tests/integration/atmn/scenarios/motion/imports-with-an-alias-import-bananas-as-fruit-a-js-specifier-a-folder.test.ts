import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	type AtmnScenario,
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const featureImport = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";\n`;
const wireImport = `import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";\n`;

type Layout = {
	kind: string;
	resolvable: boolean;
	files: Record<string, string>;
	rootImport: string;
	ownerFile: string;
};

const bananasSource = ({
	seats,
}: {
	seats: string;
}): string => `${featureImport}
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
	test(`${kind} → append and backfill land in the file that holds the array`, async () => {
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
				let thrown: unknown;
				try {
					await scenario.pull();
				} catch (error) {
					thrown = error;
				}
				expect(String(thrown)).toMatch(/plain literal/);
				expect(String(thrown)).toContain("features");
				expect(String(thrown)).toContain(remoteFeatureId);
				expect([...scenario.files().entries()]).toEqual([...before.entries()]);
				return;
			}

			await scenario.pull();
			const after = scenario.files();

			for (const file of Object.keys(layout.files)) {
				if (file === layout.ownerFile) continue;
				expect(after.get(file)).toEqual(before.get(file));
			}
			expect(after.get("autumn.config.ts")).toBe(
				before.get("autumn.config.ts"),
			);
			expect(after.get(layout.ownerFile)).not.toBe(
				before.get(layout.ownerFile),
			);
			expect(after.get(layout.ownerFile)).toContain(
				`featureId: "${remoteFeatureId}"`,
			);
			expect(after.get(layout.ownerFile)).toContain("internalId:");
		} finally {
			if (kind === KINDS[KINDS.length - 1]) scenario.cleanup();
		}
	});
}
