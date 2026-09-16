/**
 * atmn crud/versions — draft on a brand-new plan → refused before anything is sent
 *
 * A plan whose only row is `active: false` has no version anyone can buy. The
 * config lint says so and the push never reaches the server; the raw-wire
 * path gets the server's own version of that guard (scenarios/lint).
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	"active: false on a plan_id with no prior row is refused, not silently minted",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				plans: `
		plan({
			planId: "pro",
			name: "Pro",
			versionSlug: "v1",
			active: false,
			price: { amount: 49, interval: "month" },
		}),`,
			}),
		});

		try {
			const error = await scenario.push().catch((thrown) => thrown as Error);

			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(
				'Plan "pro" has 1 version and none is active.',
			);
			expect((error as Error).message).not.toContain("catalogV2");

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: Array<{ id: string }>;
			};
			expect(catalog.plans.find((row) => row.id === "pro")).toBeUndefined();
		} finally {
			scenario.cleanup();
		}
	},
);
