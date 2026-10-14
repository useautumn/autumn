import { expect, test } from "bun:test";
import {
	BillingMethod,
	type CheckResponseV3,
	type ProductItem,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("check-balance-price: verify price field in balance breakdown")}`, async () => {
	const messagesItem: ProductItem = {
		feature_id: TestFeature.Messages,
		usage_model: UsageModel.PayPerUse,
		included_usage: 100,
		price: 0.5,
		billing_units: 1,
		interval: ProductItemInterval.Month,
	};

	const wordsItem: ProductItem = {
		feature_id: TestFeature.Words,
		usage_model: UsageModel.PayPerUse,
		included_usage: 50,
		tiers: [
			{ to: 100, amount: 0.1 },
			{ to: 500, amount: 0.05 },
			{ to: "inf", amount: 0.02 },
		],
		billing_units: 1,
		interval: ProductItemInterval.Month,
	};

	const proProd = products.pro({
		id: "price-test",
		items: [messagesItem, wordsItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "check-balance-price",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	const messagesRes = (await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV3;

	expect(messagesRes.allowed).toBe(true);
	expect(messagesRes.balance).toBeDefined();
	expect(messagesRes.balance?.breakdown).toHaveLength(1);

	const messagesBreakdown = messagesRes.balance?.breakdown?.[0];
	expect(messagesBreakdown?.price).toMatchObject({
		amount: 0.5,
		billing_units: 1,
		billing_method: BillingMethod.UsageBased,
		max_purchase: null,
	});
	expect(messagesBreakdown?.price?.tiers).toBeUndefined();

	const wordsRes = (await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Words,
	})) as unknown as CheckResponseV3;

	expect(wordsRes.allowed).toBe(true);
	expect(wordsRes.balance).toBeDefined();
	expect(wordsRes.balance?.breakdown).toHaveLength(1);

	const wordsBreakdown = wordsRes.balance?.breakdown?.[0];
	expect(wordsBreakdown?.price).toMatchObject({
		billing_units: 1,
		billing_method: BillingMethod.UsageBased,
		max_purchase: null,
	});
	expect(wordsBreakdown?.price?.amount).toBeUndefined();
	expect(wordsBreakdown?.price?.tiers).toEqual([
		{ to: 150, amount: 0.1 },
		{ to: 550, amount: 0.05 },
		{ to: "inf", amount: 0.02 },
	]);
});
