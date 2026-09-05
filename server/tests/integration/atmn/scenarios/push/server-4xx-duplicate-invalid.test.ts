/**
 * atmn scenarios/push — server 4xx [duplicate, invalid] → error text verbatim, exit 1, no backfill, files untouched
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 *
 * Both cases pass local lint (no rule in packages/atmn-generator/src/lint/rules/
 * covers "two plans sharing an id" or "a license pointing at an unknown plan"),
 * so the request really reaches the server and it is the server's 4xx being
 * asserted, not the CLI's own validation.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

/** One config per case, its single server-side violation, and a needle unique
 * to that server error (not the CLI's own wording). */
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
			planId: "${id}",
			name: "First",
			price: { amount: 10, interval: "month" },
		}),
		plan({
			planId: "${id}",
			name: "Second",
			price: { amount: 20, interval: "month" },
		}),
	],
}`,
		needle: (id) => `planId "${id}"`,
		// Two rows with one id never reach the server: the lint refuses first.
		message: /is used more than once/,
	},
	invalid: {
		body: (id) => `{
	plans: [
		plan({
			planId: "${id}",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "${id}_no_such_plan", included: 25 }],
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
			// The harness spawns the real CLI: a non-zero exit surfaces as a throw
			// carrying the CLI's own output.
			expect(thrown?.message).toMatch(testCase.message);
			expect(thrown?.message).toContain(testCase.needle(id));

			// No backfill happened: the config on disk is exactly what it was.
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
