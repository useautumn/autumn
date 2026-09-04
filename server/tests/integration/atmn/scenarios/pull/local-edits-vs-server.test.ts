/**
 * atmn scenarios/pull — local edits vs server → server copy wins, reported as `~`
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

const configFor = ({ planId, amount }: { planId: string; amount: number }) =>
	`${atmnImports()}
export default atmn({
	plans: [
		plan({
			planId: "${planId}",
			name: "Pro",
			price: { amount: ${amount}, interval: "month" },
		}),
	],
});
`;

test.concurrent(
	"local edits vs server → server copy wins, reported as `~`",
	async () => {
		const planId = uniqueTestId("atmn_local_edit");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: configFor({ planId, amount: 20 }) },
		});

		try {
			await scenario.push();

			// A local edit that never gets pushed — the server still has 20.
			scenario.writeConfig(configFor({ planId, amount: 99 }));

			const pulled = await scenario.pull();
			expect(pulled.replaced).toContain(planId);
			expect(pulled.output).toContain(`~ ${planId}`);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			expect(text).toContain("amount: 20");
			expect(text).not.toContain("amount: 99");
		} finally {
			scenario.cleanup();
		}
	},
);
