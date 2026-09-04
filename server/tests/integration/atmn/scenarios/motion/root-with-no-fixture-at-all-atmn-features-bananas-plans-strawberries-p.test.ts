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
	plans: strawberries,
	planVersions: [...poo, ...pee],
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
	plan({ planId: "${pro}", name: "Pro", price: { amount: 49, interval: "month" } }),
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
			const planVersions =
				(wire.plan_versions as Record<string, unknown>[]) ?? [];

			// A remote-only history row: mint `pro` a v2 the config never
			// mentioned, restating its v1 content with a changed price in
			// `plan_versions` (a genuine diff, not a no-op) — the same shape a
			// second config directory uses to push a new version (see
			// pull-plans.test.ts). The server moves the existing v1 row to
			// history rather than creating a new one.
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
						price: { amount: 59, interval: "month" },
					},
					{ plan_id: remotePlanId, name: "Remote Plan" },
				],
				plan_versions: [
					...planVersions,
					{
						plan_id: pro,
						name: "Pro",
						version_slug: "v1",
						price: { amount: 45, interval: "month" },
					},
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
			expect(after.get("strawberries.ts")).not.toBe(
				before.get("strawberries.ts"),
			);
			expect(after.get("strawberries.ts")).toContain(
				`planId: "${remotePlanId}"`,
			);
			// poo.ts stays untouched: the resolver appends to the LAST spread in
			// `[...poo, ...pee]`, which is pee.
			expect(after.get("poo.ts")).toBe(before.get("poo.ts"));
			expect(after.get("pee.ts")).not.toBe(before.get("pee.ts"));
			// `pro`'s old v1 row moved to history: the only fixture holding
			// `versionSlug: "v1"` once it is no longer the sole/default version.
			expect(after.get("pee.ts")).toContain(`planId: "${pro}"`);
			expect(after.get("pee.ts")).toContain(`versionSlug: "v1"`);
		} finally {
			scenario.cleanup();
		}
	},
);
