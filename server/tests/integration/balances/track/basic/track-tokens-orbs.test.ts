import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

test.concurrent(
	`${chalk.yellowBright("track-tokens-orbs-1: AI balance covers the cost — parent orbs untouched")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 100,
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
			customerId: "track-tokens-orbs-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const inputTokens = 10_000;
		const outputTokens = 5_000;
		const expectedUsdCost = new Decimal(5)
			.mul(inputTokens)
			.add(new Decimal(15).mul(outputTokens))
			.div(1_000_000)
			.toNumber();

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

		expect(customer.features[TestFeature.AiCredits]).toMatchObject({
			balance: new Decimal(100).minus(expectedUsdCost).toNumber(),
			usage: expectedUsdCost,
		});

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
			includedUsage: 100,
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

		const trackRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 24_000_000,
			output_tokens: 0,
		});
		expect(trackRes.value).toBeCloseTo(120, 10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features[TestFeature.AiCredits]).toMatchObject({
			balance: 0,
			usage: 100,
		});

		expect(customer.features[TestFeature.Orbs]).toMatchObject({
			balance: new Decimal(50_000).minus(20_000).toNumber(),
			usage: 20_000,
		});
	},
);
