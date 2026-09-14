/**
 * atmn scenarios/motion — root with no fixture at all: `atmn({ features: bananas, plans: strawberries, planVersions: [...poo, ...pee] })` over `bananas.ts`, `strawberries.ts`, `poo.ts`, `pee.ts` → a remote-only feature → `bananas.ts` becomes `[...bananas, feature(...)]`; a remote-only plan → `strawberries.ts`; a remote-only version → the last spread's array (`pee.ts`); the root is byte-identical
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
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

const featureImport = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";\n`;
const planImport = `import { type Plan, plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n`;

test.concurrent(
	"root with no fixture at all — a remote-only feature, plan, and version each land in the file whose array holds that collection, while the root stays byte-identical",
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const pro = uniqueTestId("atmn_pro");
		const remoteFeatureId = uniqueTestId("atmn_remote_feat");
		const remotePlanId = uniqueTestId("atmn_remote_plan");

		const rootConfig = `import { bananas } from "./bananas";
import { strawberries } from "./strawberries";
import { poo } from "./poo";
import { pee } from "./pee";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	features: bananas,
	plans: [...strawberries, ...poo, ...pee],
});
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"bananas.ts": `${featureImport}
export const bananas = [
	feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
];
`,
				"strawberries.ts": `${planImport}
export const strawberries: Plan[] = [
	plan({ active: true, planId: "${pro}", name: "Pro", price: { amount: 49, interval: "month" } }),
];
`,
				"poo.ts": `${planImport}
export const poo: Plan[] = [];
`,
				"pee.ts": `${planImport}
export const pee: Plan[] = [];
`,
			},
		});

		try {
			await scenario.push();

			const before = scenario.files();
			const wire = await scenario.wireFromConfig();
			const features = (wire.features as Record<string, unknown>[]) ?? [];
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];

			// A remote-only version: mint `pro` a v2 the config never mentioned
			// and restate v1 inactive with a changed price (a genuine diff, not a
			// no-op) — the shape a second config directory uses to push a new
			// version. The server demotes the existing v1 row rather than
			// creating a new one.
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
				plans: [
					...plans.filter((row) => row.plan_id !== pro),
					{
						plan_id: pro,
						name: "Pro",
						version_slug: "v2",
						active: true,
						price: { amount: 59, interval: "month" },
					},
					{
						plan_id: pro,
						name: "Pro",
						version_slug: "v1",
						active: false,
						price: { amount: 45, interval: "month" },
					},
					{ plan_id: remotePlanId, name: "Remote Plan", active: true },
				],
			});

			await scenario.pull();
			const after = scenario.files();

			expect(after.get("autumn.config.ts")).toBe(
				before.get("autumn.config.ts"),
			);
			expect(after.get("bananas.ts")).not.toBe(before.get("bananas.ts"));
			expect(after.get("bananas.ts")).toContain(
				`featureId: "${remoteFeatureId}"`,
			);
			// The row the config already holds is edited where it is: pro's v1
			// flips to inactive in strawberries.ts.
			expect(after.get("strawberries.ts")).not.toBe(
				before.get("strawberries.ts"),
			);
			expect(after.get("strawberries.ts")).toContain("active: false");
			// New rows append to the LAST spread in `[...strawberries, ...poo, ...pee]`.
			expect(after.get("poo.ts")).toBe(before.get("poo.ts"));
			expect(after.get("pee.ts")).not.toBe(before.get("pee.ts"));
			expect(after.get("pee.ts")).toContain(`planId: "${remotePlanId}"`);
			expect(after.get("pee.ts")).toContain(`planId: "${pro}"`);
			expect(after.get("pee.ts")).toContain(`versionSlug: "v2"`);
		} finally {
			scenario.cleanup();
		}
	},
);
