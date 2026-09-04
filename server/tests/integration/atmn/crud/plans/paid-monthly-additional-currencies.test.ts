/**
 * atmn crud/plans — paid [monthly] [additional currencies] → clean error while org multi-currency is off
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

// Not a round trip: additional currencies need the org's multi-currency
// config on, which this scenario's org never enables, so push must refuse.
test.concurrent(
	"paid [monthly] [additional currencies] → clean error while org multi-currency is off",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				plans: `
		plan({
			planId: "pro",
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
			await expect(scenario.push()).rejects.toThrow(
				/\/v1\/catalogV2\.preview_update failed \(400\)/,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
