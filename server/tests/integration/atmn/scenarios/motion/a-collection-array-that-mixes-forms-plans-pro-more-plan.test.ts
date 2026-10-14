import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const planImport = `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";\n`;

test.concurrent(
	"a collection array that mixes forms (`plans: [pro, ...more, plan({ active: true,...})]`) → the named reference and the spread stay untouched by a remote add, and a remote update on the reference rewrites its own file",
	async () => {
		const proId = uniqueTestId("atmn_pro");
		const spreadId = uniqueTestId("atmn_spread");
		const inlineId = uniqueTestId("atmn_inline");
		const remotePlanId = uniqueTestId("atmn_remote");

		const rootConfig = `import { pro } from "./pro";
import { more } from "./more";
${planImport}
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn({
	plans: [
		pro,
		...more,
		plan({ active: true, planId: "${inlineId}", name: "Inline", versionSlug: "v1", price: { amount: 5, interval: "month" } }),
	],
});
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig },
			files: {
				"pro.ts": `${planImport}
export const pro = plan({ active: true, planId: "${proId}", name: "Pro", versionSlug: "v1", price: { amount: 49, interval: "month" } });
`,
				"more.ts": `${planImport}
export const more = [
	plan({ active: true, planId: "${spreadId}", name: "Spread", versionSlug: "v1", price: { amount: 15, interval: "month" } }),
];
`,
			},
		});

		try {
			await scenario.push();

			const before = scenario.files();
			const wire = await scenario.wireFromConfig();
			const plans = (wire.plans as Record<string, unknown>[]) ?? [];
			const proWire = plans.find((row) => row.plan_id === proId);

			await scenario.client.update({
				...wire,
				plans: [
					...plans.filter((row) => row.plan_id !== proId),
					{ ...proWire, price: { amount: 79, interval: "month" } },
					{ plan_id: remotePlanId, name: "Remote" },
				],
			});

			await scenario.pull();
			const after = scenario.files();

			expect(after.get("pro.ts")).not.toBe(before.get("pro.ts"));
			expect(after.get("pro.ts")).toContain("amount: 79");

			expect(after.get("more.ts")).toBe(before.get("more.ts"));

			expect(after.get("autumn.config.ts")).not.toBe(
				before.get("autumn.config.ts"),
			);
			expect(after.get("autumn.config.ts")).toContain(
				`planId: "${remotePlanId}"`,
			);
			expect(after.get("autumn.config.ts")).toContain("pro,");
			expect(after.get("autumn.config.ts")).toContain("...more,");
		} finally {
			scenario.cleanup();
		}
	},
);
