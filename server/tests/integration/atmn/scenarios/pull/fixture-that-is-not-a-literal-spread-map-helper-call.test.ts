/**
 * atmn scenarios/pull — fixture that is not a literal [spread, .map, helper call] → hard error naming it, nothing written
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

/** Every form a fixture can take that ast-grep's literal search cannot edit:
 * a spread into the object, an id built by `.map()`, and args built by a
 * helper call. None of these are ever pushed, so the preview always reports
 * `action: "create"` and pull must refuse to touch the config at all. */
const NON_LITERAL_FORMS: Record<string, (planId: string) => string> = {
	spread: (
		planId,
	) => `const base = { name: "Pro", price: { amount: 20, interval: "month" } };
export default atmn({
	plans: [plan({ ...base, planId: "${planId}" })],
});
`,
	".map": (planId) => `const ids = ["${planId}"];
export default atmn({
	plans: ids.map((id) => plan({ planId: id, name: "Pro", price: { amount: 20, interval: "month" } })),
});
`,
	"helper call": (
		planId,
	) => `const buildPlanArgs = ({ planId }: { planId: string }) => ({
	planId,
	name: "Pro",
	price: { amount: 20, interval: "month" },
});
export default atmn({
	plans: [plan(buildPlanArgs({ planId: "${planId}" }))],
});
`,
};

for (const [form, body] of Object.entries(NON_LITERAL_FORMS)) {
	test.concurrent(
		`fixture that is not a literal [${form}] → hard error naming it, nothing written`,
		async () => {
			const planId = uniqueTestId("atmn_dynamic");

			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: { raw: `${atmnImports()}\n${body(planId)}` },
			});

			try {
				const before = scenario.files();

				await expect(scenario.pull()).rejects.toThrow(
					new RegExp(`plans "${planId}": delete from your config`),
				);

				expect([...scenario.files().entries()]).toEqual([...before.entries()]);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
