import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"a fixture built by a helper or spread (`plan({ active: true, ...base, planId })`) → a remote update it can't apply in place errors naming the fixture, and writes nothing",
	async () => {
		const customId = uniqueTestId("atmn_custom");

		const rootConfig = `import { custom } from "./plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({ plans: [custom] });
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"plans.ts": `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";

const base = { name: "Custom", price: { amount: 20, interval: "month" as const } };
export const custom = plan({ active: true, ...base, planId: "${customId}", versionSlug: "v1", });
`,
			},
		});

		try {
			await scenario.push();

			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const customWire = plans.find((row) => row.plan_id === customId);
			await scenario.client.update({
				...wire,
				plans: [{ ...customWire, price: { amount: 45, interval: "month" } }],
			});

			const before = scenario.files();
			let thrown: unknown;
			try {
				await scenario.pull();
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeDefined();
			expect(String(thrown)).toContain(customId);
			expect(String(thrown)).toMatch(/plain literal/);

			expect([...scenario.files().entries()]).toEqual([...before.entries()]);
		} finally {
			scenario.cleanup();
		}
	},
);
