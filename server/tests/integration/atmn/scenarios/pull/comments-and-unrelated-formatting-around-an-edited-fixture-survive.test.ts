/**
 * atmn scenarios/pull — comments and unrelated formatting around an edited fixture survive
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

test.concurrent(
	"comments and unrelated formatting around an edited fixture survive",
	async () => {
		const planId = uniqueTestId("atmn_comments");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: {
				raw: `${atmnImports()}
// Top-level catalog comment.

export default atmn({
	plans: [
		// A plan with a comment right above it.
		plan({
			planId: "${planId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
		}),
		// Trailing comment after the array's only fixture.
	],
});
`,
			},
		});

		try {
			await scenario.push();

			// The server moves ahead by itself — a dashboard-style price edit.
			await scenario.client.update({
				plans: [{ plan_id: planId, price: { amount: 30, interval: "month" } }],
				skip_deletions: false,
				migration: { draft: true },
			});

			const pulled = await scenario.pull();
			expect(pulled.replaced).toContain(planId);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).toContain("// Top-level catalog comment.");
			expect(text).toContain("// A plan with a comment right above it.");
			expect(text).toContain(
				"// Trailing comment after the array's only fixture.",
			);
			expect(text).toContain("amount: 30");
		} finally {
			scenario.cleanup();
		}
	},
);
