/**
 * atmn scenarios/motion — a file holding two collections' arrays (features and plans in one `catalog.ts`) → each append goes to its own array
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

test.concurrent(
	"a file holding two collections' arrays (features and plans in one `catalog.ts`) → each remote-only row appends to its own array",
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const pro = uniqueTestId("atmn_pro");
		const remoteFeatureId = uniqueTestId("atmn_remote_feat");
		const remotePlanId = uniqueTestId("atmn_remote_plan");

		const rootConfig = `import { features, plans } from "./catalog";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({ features, plans });
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"catalog.ts": `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";

export const features = [
	feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
];

export const plans = [
	plan({ planId: "${pro}", name: "Pro", price: { amount: 49, interval: "month" } }),
];
`,
			},
		});

		try {
			await scenario.push();

			const before = scenario.files().get("catalog.ts") ?? "";
			const wire = await scenario.wireFromConfig();
			const features = (wire.features as Record<string, unknown>[]) ?? [];
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];

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
				plans: [...plans, { plan_id: remotePlanId, name: "Remote Plan" }],
			});

			await scenario.pull();
			const after = scenario.files().get("catalog.ts") ?? "";

			expect(after).toContain(`featureId: "${remoteFeatureId}"`);
			expect(after).toContain(`planId: "${remotePlanId}"`);

			// Each insertion lands in its own array: the new feature sits before
			// the `plans` array starts, the new plan sits after it.
			const plansArrayStart = after.indexOf("export const plans");
			expect(after.indexOf(`featureId: "${remoteFeatureId}"`)).toBeLessThan(
				plansArrayStart,
			);
			expect(after.indexOf(`planId: "${remotePlanId}"`)).toBeGreaterThan(
				plansArrayStart,
			);
			expect(after).not.toBe(before);
		} finally {
			scenario.cleanup();
		}
	},
);
