import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-ORBS: AI credit system nested inside a parent credit system
// Verifies that a single /track/tokens call deducts USD from the AI credit
// feature AND deducts the ratio-mapped amount from any parent credit
// system whose schema references it.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-orbs: AI credit system inside parent credit system deducts both balances")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 100, // $100 of AI usage
		});
		const orbsItem = items.free({
			featureId: TestFeature.Orbs,
			includedUsage: 50_000, // 50,000 orbs
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem, orbsItem],
		});

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "track-tokens-orbs",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// custom/internal-model: input_cost=5 $/M, output_cost=15 $/M, markup=0%
		const inputTokens = 10_000;
		const outputTokens = 5_000;
		const expectedUsdCost = new Decimal(5)
			.mul(inputTokens)
			.add(new Decimal(15).mul(outputTokens))
			.div(1_000_000)
			.toNumber(); // 0.125

		// Orbs schema: 1000 orbs per $1 of AI usage
		const expectedOrbsCost = new Decimal(expectedUsdCost).mul(1000).toNumber(); // 125

		const trackRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: inputTokens,
			output_tokens: outputTokens,
		});

		expect(trackRes.customer_id).toBe(customerId);
		expect(trackRes.value).toBeCloseTo(expectedUsdCost, 10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// AI credit feature balance dropped by USD cost (1:1)
		expect(customer.features[TestFeature.AiCredits]).toMatchObject({
			balance: new Decimal(100).minus(expectedUsdCost).toNumber(),
			usage: expectedUsdCost,
		});

		// Parent orbs balance dropped by USD cost × 1000
		expect(customer.features[TestFeature.Orbs]).toMatchObject({
			balance: new Decimal(50_000).minus(expectedOrbsCost).toNumber(),
			usage: expectedOrbsCost,
		});
	},
);
