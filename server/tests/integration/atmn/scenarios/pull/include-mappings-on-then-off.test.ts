/**
 * atmn scenarios/pull — `--include-mappings` on then off → processors kept then dropped
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

const emptyPlansConfig = `${atmnImports()}
export default atmn({
	plans: [],
});
`;

test.concurrent(
	"`--include-mappings` on then off → processors kept then dropped",
	async () => {
		const planId = uniqueTestId("atmn_mappings");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: emptyPlansConfig },
		});

		try {
			// A server-only plan, created straight through the client so it gets
			// real Stripe processors (the same path push's default createInStripe uses).
			await scenario.client.update({
				plans: [
					{
						plan_id: planId,
						name: "Mapped",
						price: { amount: 20, interval: "month" },
					},
				],
				skip_deletions: false,
				migration: { draft: true },
			});

			const withMappings = await scenario.pull({ includeMappings: true });
			expect(withMappings.appended).toContain(`${planId}@v1`);
			expect(scenario.files().get("autumn.config.ts")).toContain("processors:");

			// Reset the local file back to empty so the plan is server-only again.
			scenario.writeConfig(emptyPlansConfig);

			const withoutMappings = await scenario.pull({ includeMappings: false });
			expect(withoutMappings.appended).toContain(`${planId}@v1`);
			expect(scenario.files().get("autumn.config.ts")).not.toContain(
				"processors:",
			);
		} finally {
			scenario.cleanup();
		}
	},
);
