/**
 * atmn crud/mappings — unknown stripe id → error surfaced (stripe test mode)
 *
 * `--include-mappings`
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

// Unlike plan- and feature-level processors, an adopted price id IS checked
// against real Stripe (validateAdoptedStripePrices, execute phase) — no
// createInStripe: false here, so that check actually runs against the org's
// Stripe test account and 400s on an id that was never created.
const proPlanWithUnknownPrice = `
		plan({
			planId: "pro",
			name: "Pro",
			price: {
				amount: 49,
				interval: "month",
				processors: { stripe: { priceId: "price_atmn_does_not_exist_123" } },
			},
		}),`;

test.concurrent(
	"adopting an unknown Stripe price id surfaces a clean error",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ plans: proPlanWithUnknownPrice }),
		});

		try {
			await expect(scenario.push()).rejects.toThrow(
				/price_atmn_does_not_exist_123/,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
