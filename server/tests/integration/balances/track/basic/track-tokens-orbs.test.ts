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
//
// Parent credit systems are overflow pools (same semantics as classic
// metered → credits deduction order): a token track drains the AI credit
// balance first, and only the overflow is ratio-mapped onto the parent.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-orbs-1: AI balance covers the cost — parent orbs untouched")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 100, // $100 of AI usage
		});
		const orbsItem = items.free({
			featureId: TestFeature.Orbs,
			includedUsage: 50_000, // orbs schema: 1000 orbs per $1 of AI usage
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem, orbsItem],
		});

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "track-tokens-orbs-1",
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

		// AI balance covered the full cost, so the parent overflow pool is untouched
		expect(customer.features[TestFeature.Orbs]).toMatchObject({
			balance: 50_000,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-orbs-2: cost exceeding AI balance overflows into parent orbs at the schema ratio")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 100, // $100 of AI usage
		});
		const orbsItem = items.free({
			featureId: TestFeature.Orbs,
			includedUsage: 50_000,
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem, orbsItem],
		});

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "track-tokens-orbs-2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// (5 * 24M) / 1M = $120 > the $100 AI balance
		const trackRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 24_000_000,
			output_tokens: 0,
		});
		expect(trackRes.value).toBeCloseTo(120, 10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// AI pool fully drained
		expect(customer.features[TestFeature.AiCredits]).toMatchObject({
			balance: 0,
			usage: 100,
		});

		// $20 overflow lands on orbs at 1000 orbs per $1
		expect(customer.features[TestFeature.Orbs]).toMatchObject({
			balance: new Decimal(50_000).minus(20_000).toNumber(),
			usage: 20_000,
		});
	},
);
