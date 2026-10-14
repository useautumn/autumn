import { expect, test } from "bun:test";

import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";

test.concurrent(
	`${chalk.yellowBright("track-tokens-replay-1: queued replay body deducts AI credits 1:1")}`,
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

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "track-tokens-replay-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const usdCost = 0.125;

		await runQueuedTrack({
			ctx: { ...ctx, apiVersion: new ApiVersionClass(ApiVersion.V2_1) },
			body: {
				customer_id: customerId,
				feature_id: TestFeature.AiCredits,
				value: usdCost,
				idempotency_key: `replay-${crypto.randomUUID()}`,
			},
			apiVersion: ApiVersion.V2_1,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features[TestFeature.AiCredits]).toMatchObject({
			balance: new Decimal(100).minus(usdCost).toNumber(),
			usage: usdCost,
		});
		expect(customer.features[TestFeature.Orbs]).toMatchObject({
			balance: 50_000,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-replay-2: plain /track with a USD value deducts an AI credit balance 1:1")}`,
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
			customerId: "track-tokens-replay-2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const usdValue = 5;
		await autumnV2.post("/track", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			value: usdValue,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features[TestFeature.AiCredits]).toMatchObject({
			balance: new Decimal(100).minus(usdValue).toNumber(),
			usage: usdValue,
		});
		expect(customer.features[TestFeature.Orbs]).toMatchObject({
			balance: 50_000,
			usage: 0,
		});
	},
);
