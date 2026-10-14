import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const CASES: Record<
	string,
	{
		body: (id: string) => string;
		needle: (id: string) => string;
		message: RegExp;
	}
> = {
	duplicate: {
		body: (id) => `{
	plans: [
		plan({
			active: true,
			planId: "${id}",
			name: "First",
			versionSlug: "v1",
			price: { amount: 10, interval: "month" },
		}),
		plan({
			active: true,
			planId: "${id}",
			name: "Second",
			versionSlug: "v1",
			price: { amount: 20, interval: "month" },
		}),
	],
}`,
		needle: (id) => `planId "${id}"`,
		message: /is used more than once/,
	},
	invalid: {
		body: (id) => `{
	plans: [
		plan({
			active: true,
			planId: "${id}",
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "${id}_no_such_plan", versionSlug: "v1", included: 25 }],
		}),
	],
}`,
		needle: (id) => `${id}_no_such_plan`,
		message: /\/v1\/catalogV2\.\w+ failed \(\d+\): /,
	},
};

for (const [kind, testCase] of Object.entries(CASES)) {
	test(`server 4xx [${kind}] → error text verbatim, exit 1, no backfill, files untouched`, async () => {
		const id = uniqueTestId(`atmn_4xx_${kind}`);

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: testCase.body(id),
		});

		try {
			const before = scenario.files();

			let thrown: Error | undefined;
			try {
				await scenario.push();
			} catch (error) {
				thrown = error as Error;
			}

			expect(thrown).toBeDefined();
			expect(thrown?.message).toMatch(testCase.message);
			expect(thrown?.message).toContain(testCase.needle(id));

			expect([...scenario.files().entries()]).toEqual([...before.entries()]);

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: Array<{ id: string }>;
			};
			expect(catalog.plans.some((row) => row.id === id)).toBe(false);
		} finally {
			scenario.cleanup();
		}
	});
}
