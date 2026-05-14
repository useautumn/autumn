import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-1: Basic trackTokens with models.dev pricing
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-tokens-1: basic trackTokens with models.dev pricing")}`, async () => {
	const aiCreditsItem = items.free({
		featureId: TestFeature.AiCredits,
		includedUsage: 1000,
	});
	const freeProd = products.base({
		id: "free",
		items: [aiCreditsItem],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "track-tokens-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const aiCreditFeature = ctx.features.find(
		(f) => f.id === TestFeature.AiCredits,
	);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.AiCredits].balance).toBe(1000);

	const inputTokens = 1000;
	const outputTokens = 500;
	const modelId = "anthropic/claude-sonnet-4-20250514";

	const expectedCost = await getCreditCost({
		featureId: aiCreditFeature!.id,
		creditSystem: aiCreditFeature!,
		modelName: modelId,
		tokens: { input: inputTokens, output: outputTokens },
	});

	const trackRes: TrackResponseV2 = await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: modelId,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
	});

	expect(trackRes.customer_id).toBe(customerId);
	expect(trackRes.value).toBeCloseTo(expectedCost, 10);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter.features[TestFeature.AiCredits]).toMatchObject({
		balance: new Decimal(1000).minus(expectedCost).toNumber(),
		usage: expectedCost,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-2: Disambiguation error + explicit feature_id resolution
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-tokens-2: disambiguation error and explicit feature_id resolution")}`, async () => {
	const aiCreditsItem = items.free({
		featureId: TestFeature.AiCredits,
		includedUsage: 500,
	});
	const aiCredits2Item = items.free({
		featureId: TestFeature.AiCredits2,
		includedUsage: 500,
	});
	const freeProd = products.base({
		id: "free",
		items: [aiCreditsItem, aiCredits2Item],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "track-tokens-2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Without feature_id, should fail with disambiguation error
	let error: any;
	try {
		await autumnV2.post("/trackTokens", {
			customer_id: customerId,
			model_id: "anthropic/claude-sonnet-4-20250514",
			input_tokens: 100,
			output_tokens: 50,
		});
	} catch (e) {
		error = e;
	}
	expect(error).toBeDefined();
	expect(error.message).toContain("Multiple AI credit system features");

	// With explicit feature_id, should succeed and only deduct from AiCredits
	const aiCreditFeature = ctx.features.find(
		(f) => f.id === TestFeature.AiCredits,
	);

	const inputTokens = 2000;
	const outputTokens = 1000;
	const modelId = "anthropic/claude-sonnet-4-20250514";

	const expectedCost = await getCreditCost({
		featureId: aiCreditFeature!.id,
		creditSystem: aiCreditFeature!,
		modelName: modelId,
		tokens: { input: inputTokens, output: outputTokens },
	});

	const trackRes: TrackResponseV2 = await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: modelId,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
	});

	expect(trackRes.customer_id).toBe(customerId);
	expect(trackRes.value).toBeCloseTo(expectedCost, 10);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.AiCredits]).toMatchObject({
		balance: new Decimal(500).minus(expectedCost).toNumber(),
		usage: expectedCost,
	});
	expect(customer.features[TestFeature.AiCredits2]).toMatchObject({
		balance: 500,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-3: custom/* model pricing (with and without markup)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-tokens-3: custom model pricing with and without markup")}`, async () => {
	const aiCreditsItem = items.free({
		featureId: TestFeature.AiCredits,
		includedUsage: 1000,
	});
	const freeProd = products.base({
		id: "free",
		items: [aiCreditsItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-tokens-3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// custom/internal-model: input_cost=5 $/M, output_cost=15 $/M, markup=0%
	const expectedCostNoMarkup = new Decimal(5)
		.mul(10000)
		.add(new Decimal(15).mul(5000))
		.div(1_000_000)
		.toNumber(); // 0.125

	const trackRes1: TrackResponseV2 = await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: "custom/internal-model",
		input_tokens: 10000,
		output_tokens: 5000,
	});

	expect(trackRes1.value).toBeCloseTo(expectedCostNoMarkup, 10);

	// custom/marked-up-model: input_cost=10 $/M, output_cost=30 $/M, markup=50%
	const baseCost = new Decimal(10)
		.mul(8000)
		.add(new Decimal(30).mul(2000))
		.div(1_000_000);
	const expectedCostWithMarkup = baseCost
		.mul(new Decimal(1).add(new Decimal(50).div(100)))
		.toNumber(); // 0.21

	const trackRes2: TrackResponseV2 = await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: "custom/marked-up-model",
		input_tokens: 8000,
		output_tokens: 2000,
	});

	expect(trackRes2.value).toBeCloseTo(expectedCostWithMarkup, 10);

	const totalCost = new Decimal(expectedCostNoMarkup)
		.plus(expectedCostWithMarkup)
		.toNumber();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.AiCredits]).toMatchObject({
		balance: new Decimal(1000).minus(totalCost).toNumber(),
		usage: totalCost,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-4: models.dev pricing with markup + error for non-AI feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-tokens-4: models.dev markup and non-AI feature_id error")}`, async () => {
	const aiCreditsItem = items.free({
		featureId: TestFeature.AiCredits,
		includedUsage: 1000,
	});
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [aiCreditsItem, creditsItem],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "track-tokens-4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const aiCreditFeature = ctx.features.find(
		(f) => f.id === TestFeature.AiCredits,
	);

	// anthropic/claude-haiku-3.5 has 20% markup in test config
	const inputTokens = 50000;
	const outputTokens = 10000;
	const modelId = "anthropic/claude-3-5-haiku-20241022";

	const expectedCost = await getCreditCost({
		featureId: aiCreditFeature!.id,
		creditSystem: aiCreditFeature!,
		modelName: modelId,
		tokens: { input: inputTokens, output: outputTokens },
	});

	const trackRes: TrackResponseV2 = await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: modelId,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
	});

	expect(trackRes.value).toBeCloseTo(expectedCost, 10);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.AiCredits]).toMatchObject({
		balance: new Decimal(1000).minus(expectedCost).toNumber(),
		usage: expectedCost,
	});

	// Pointing at a regular credit system should fail
	let error: any;
	try {
		await autumnV2.post("/trackTokens", {
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			model_id: "anthropic/claude-sonnet-4-20250514",
			input_tokens: 100,
			output_tokens: 50,
		});
	} catch (e) {
		error = e;
	}
	expect(error).toBeDefined();
	expect(error.message).toContain("not an AI credit system");
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-5: Multiple tracks accumulate correctly
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-tokens-5: multiple tracks accumulate balance deductions")}`, async () => {
	const aiCreditsItem = items.free({
		featureId: TestFeature.AiCredits,
		includedUsage: 1000,
	});
	const freeProd = products.base({
		id: "free",
		items: [aiCreditsItem],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "track-tokens-5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const aiCreditFeature = ctx.features.find(
		(f) => f.id === TestFeature.AiCredits,
	);

	// First track: custom/internal-model (input_cost=5, output_cost=15, markup=0%)
	const cost1 = await getCreditCost({
		featureId: aiCreditFeature!.id,
		creditSystem: aiCreditFeature!,
		modelName: "custom/internal-model",
		tokens: { input: 5000, output: 2000 },
	});

	await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: "custom/internal-model",
		input_tokens: 5000,
		output_tokens: 2000,
	});

	// Second track: custom/marked-up-model (input_cost=10, output_cost=30, markup=50%)
	const cost2 = await getCreditCost({
		featureId: aiCreditFeature!.id,
		creditSystem: aiCreditFeature!,
		modelName: "custom/marked-up-model",
		tokens: { input: 3000, output: 1000 },
	});

	await autumnV2.post("/trackTokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: "custom/marked-up-model",
		input_tokens: 3000,
		output_tokens: 1000,
	});

	const totalCost = new Decimal(cost1).plus(cost2).toNumber();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.AiCredits]).toMatchObject({
		balance: new Decimal(1000).minus(totalCost).toNumber(),
		usage: totalCost,
	});
});
