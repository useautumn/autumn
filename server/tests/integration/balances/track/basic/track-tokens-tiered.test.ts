import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

test.concurrent(
	`${chalk.yellowBright("track-tokens-tiered: per-model override wins over provider markup fallback")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCreditsTiered,
			includedUsage: 1000,
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem],
		});

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "track-tokens-tiered",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const inputTokens = 10000;
		const outputTokens = 5000;
		const baseCost = new Decimal(10)
			.mul(inputTokens)
			.add(new Decimal(20).mul(outputTokens))
			.div(1_000_000);

		const overrideCost = baseCost.mul(1.05).toNumber();
		const overrideRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCreditsTiered,
			model_id: "custom/override-model",
			input_tokens: inputTokens,
			output_tokens: outputTokens,
		});
		expect(overrideRes.value).toBeCloseTo(overrideCost, 10);

		const providerCost = baseCost.mul(1.3).toNumber();
		const providerRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCreditsTiered,
			model_id: "custom/provider-fallback-model",
			input_tokens: inputTokens,
			output_tokens: outputTokens,
		});
		expect(providerRes.value).toBeCloseTo(providerCost, 10);

		const totalCost = new Decimal(overrideCost).plus(providerCost).toNumber();
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.AiCreditsTiered]).toMatchObject({
			balance: new Decimal(1000).minus(totalCost).toNumber(),
			usage: totalCost,
		});
	},
);
