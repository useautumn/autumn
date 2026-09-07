/**
 * atmn scenarios/push — multi-currency price with the org config off → clean error, not a crash
 *
 * One line of plans/atmn-v3/07_tests.md.
 *
 * Companion to crud/plans/paid-monthly-additional-currencies: that contract
 * checks the base price case; this one is the push-behavior contract — the
 * failure is a clean, typed 400 (not a hang, a 500, or an unhandled throw
 * mid-request), and nothing is left half-applied.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

// This scenario's org never turns multi-currency on, so an additional
// currency on either the base price or an item price must be refused.
test("multi-currency price with the org config off → clean error, not a crash", async () => {
	const planId = uniqueTestId("atmn_multi_currency");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			plans: `
		plan({
			planId: "${planId}",
			name: "Pro",
			price: {
				amount: 49,
				interval: "month",
				additionalCurrencies: [{ currency: "eur", amount: 45 }],
			},
			items: [],
		}),`,
		}),
	});

	try {
		const before = scenario.files();

		let thrown: Error | undefined;
		try {
			await scenario.push();
		} catch (error) {
			thrown = error as Error;
		}

		// A clean, typed 400 — not a hang, not a 500, not some other crash.
		expect(thrown).toBeDefined();
		expect(thrown?.message).toMatch(
			/\/v1\/catalogV2\.preview_update failed \(400\): /,
		);

		expect([...scenario.files().entries()]).toEqual([...before.entries()]);

		const catalog = (await scenario.client.get({})) as unknown as {
			plans: Array<{ id: string }>;
		};
		expect(catalog.plans.some((row) => row.id === planId)).toBe(false);
	} finally {
		scenario.cleanup();
	}
});
