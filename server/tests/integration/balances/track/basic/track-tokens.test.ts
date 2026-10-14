import { expect, test } from "bun:test";

import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEventsListResponse,
	Feature,
	TrackResponseV2,
	TrackResponseV3,
} from "@autumn/shared";
import { ApiVersion, ErrCode, events, FeatureType } from "@autumn/shared";
import { eventsDb } from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { and, desc, eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getModelCreditCost } from "@/internal/features/aiCreditSystemUtils.js";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing.js";

const TINYBIRD_INGEST_WAIT_MS = 3000;

const hasRate = (rate: number | undefined): rate is number =>
	typeof rate === "number" && rate > 0;

const pickRandomModel = async ({
	label,
	requireCachePricing = false,
}: {
	label: string;
	requireCachePricing?: boolean;
}): Promise<string> => {
	const pricingData = await getModelsDevPricing();
	const candidates: string[] = [];
	for (const [providerKey, provider] of Object.entries(pricingData)) {
		if (providerKey === "custom") continue;
		for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
			const cost = model.cost;
			if (!(cost && hasRate(cost.input) && hasRate(cost.output))) continue;
			if (
				requireCachePricing &&
				!(hasRate(cost.cache_read) && hasRate(cost.cache_write))
			) {
				continue;
			}
			candidates.push(`${providerKey}/${modelKey}`);
		}
	}
	if (candidates.length === 0) {
		throw new Error("No priced models found in models.dev catalog");
	}
	const modelId = candidates[Math.floor(Math.random() * candidates.length)];
	console.log(`${label}: using models.dev model ${modelId}`);
	return modelId;
};

test.concurrent(
	`${chalk.yellowBright("track-tokens-1: basic trackTokens with models.dev pricing")}`,
	async () => {
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
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const aiCreditFeature = ctx.features.find(
			(f) => f.id === TestFeature.AiCredits,
		);
		if (!aiCreditFeature) {
			throw new Error(`${TestFeature.AiCredits} feature not found`);
		}

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.AiCredits].balance).toBe(1000);

		const inputTokens = 1000;
		const outputTokens = 500;
		const modelId = await pickRandomModel({ label: "track-tokens-1" });

		const expectedCost = await getModelCreditCost({
			modelName: modelId,
			creditSystem: aiCreditFeature,
			input: inputTokens,
			output: outputTokens,
		});
		expect(expectedCost).toBeGreaterThan(0);

		const trackRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: modelId,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
		});

		expect(trackRes.customer_id).toBe(customerId);
		expect(trackRes.value).toBeCloseTo(expectedCost, 10);

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfter.features[TestFeature.AiCredits]).toMatchObject({
			balance: new Decimal(1000).minus(expectedCost).toNumber(),
			usage: expectedCost,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens timestamp: backdated timestamp is recorded on token usage events")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 1000,
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem],
		});

		const timestampModelId = await pickRandomModel({
			label: "track-tokens-timestamp",
		});
		const runId = Date.now();
		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: `track-tokens-timestamp-${runId}`,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const backdatedTimestamp = Math.floor((Date.now() - 10_000) / 1000) * 1000;
		const beforeDefaultTrack = Date.now();
		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: timestampModelId,
			input_tokens: 100,
			output_tokens: 50,
			properties: { marker: "backdated" },
			timestamp: backdatedTimestamp,
			idempotency_key: `track-tokens-timestamp-backdated-${runId}`,
		});
		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: timestampModelId,
			input_tokens: 100,
			output_tokens: 50,
			properties: { marker: "default-now" },
			idempotency_key: `track-tokens-timestamp-default-now-${runId}`,
		});
		const afterDefaultTrack = Date.now();

		let publicBackdatedEvent: ApiEventsListResponse["list"][number] | undefined;
		let publicDefaultEvent: ApiEventsListResponse["list"][number] | undefined;
		for (let attempt = 0; attempt < 5; attempt++) {
			await timeout(TINYBIRD_INGEST_WAIT_MS);
			const eventsList = (await autumnV1.events.list({
				customer_id: customerId,
			})) as ApiEventsListResponse;
			publicBackdatedEvent = eventsList.list.find(
				(event) => event.properties?.marker === "backdated",
			);
			publicDefaultEvent = eventsList.list.find(
				(event) => event.properties?.marker === "default-now",
			);
			if (publicBackdatedEvent && publicDefaultEvent) break;
		}

		expect(publicBackdatedEvent?.timestamp).toBe(backdatedTimestamp);
		expect(publicDefaultEvent?.timestamp).toBeGreaterThanOrEqual(
			beforeDefaultTrack,
		);
		expect(publicDefaultEvent?.timestamp).toBeLessThanOrEqual(
			afterDefaultTrack + TINYBIRD_INGEST_WAIT_MS,
		);

		const customer = (await autumnV2_2.customers.get(customerId, {
			with_autumn_id: true,
		})) as ApiCustomerV5 & { autumn_id?: string };
		const eventRows = await eventsDb()
			.select({
				created_at: events.created_at,
				timestamp: events.timestamp,
				properties: events.properties,
			})
			.from(events)
			.where(
				and(
					eq(events.org_id, ctx.org.id),
					eq(events.env, ctx.env),
					eq(events.internal_customer_id, customer.autumn_id as string),
				),
			)
			.orderBy(desc(events.created_at))
			.limit(5);

		const dbBackdatedEvent = eventRows.find(
			(event) => event.properties?.marker === "backdated",
		);
		const dbDefaultEvent = eventRows.find(
			(event) => event.properties?.marker === "default-now",
		);

		expect(dbBackdatedEvent?.created_at).toBe(backdatedTimestamp);
		expect(dbBackdatedEvent?.timestamp?.getTime()).toBe(backdatedTimestamp);
		expect(dbDefaultEvent?.created_at).toBeGreaterThanOrEqual(
			beforeDefaultTrack,
		);
		expect(dbDefaultEvent?.created_at).toBeLessThanOrEqual(
			afterDefaultTrack + TINYBIRD_INGEST_WAIT_MS,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-2: disambiguation error and explicit feature_id resolution")}`,
	async () => {
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
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const modelId = await pickRandomModel({ label: "track-tokens-2" });

		let error: any;
		try {
			await autumnV2.post("/track_tokens", {
				customer_id: customerId,
				model_id: modelId,
				input_tokens: 100,
				output_tokens: 50,
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeDefined();
		expect(error.message).toContain("Multiple AI credit system features");

		const aiCreditFeature = ctx.features.find(
			(f) => f.id === TestFeature.AiCredits,
		);
		if (!aiCreditFeature) {
			throw new Error(`${TestFeature.AiCredits} feature not found`);
		}

		const inputTokens = 2000;
		const outputTokens = 1000;

		const expectedCost = await getModelCreditCost({
			modelName: modelId,
			creditSystem: aiCreditFeature,
			input: inputTokens,
			output: outputTokens,
		});
		expect(expectedCost).toBeGreaterThan(0);

		const trackRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-3: custom model pricing with and without markup")}`,
	async () => {
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
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const expectedCostNoMarkup = new Decimal(5)
			.mul(10000)
			.add(new Decimal(15).mul(5000))
			.div(1_000_000)
			.toNumber();

		const trackRes1: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
		});

		expect(trackRes1.value).toBeCloseTo(expectedCostNoMarkup, 10);

		const baseCost = new Decimal(10)
			.mul(8000)
			.add(new Decimal(30).mul(2000))
			.div(1_000_000);
		const expectedCostWithMarkup = baseCost
			.mul(new Decimal(1).add(new Decimal(50).div(100)))
			.toNumber();

		const trackRes2: TrackResponseV2 = await autumnV2.post("/track_tokens", {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-4: models.dev markup and non-AI feature_id error")}`,
	async () => {
		const modelId = await pickRandomModel({ label: "track-tokens-4" });
		const markupPercent = 20;

		const featureId = `ai_credits_markup_${Date.now()}_${Math.random()
			.toString(36)
			.slice(2, 8)}`;
		const autumn = new AutumnInt({ version: ApiVersion.V2_2 });
		await autumn.post("/features.create", {
			feature_id: featureId,
			name: "AI Credits Markup",
			type: FeatureType.AiCreditSystem,
			model_markups: {
				[modelId]: { markup: markupPercent },
			},
		});

		const aiCreditsItem = items.free({
			featureId,
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

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "track-tokens-4",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const inputTokens = 50000;
		const outputTokens = 10000;

		const markupFeature = {
			type: FeatureType.AiCreditSystem,
			model_markups: { [modelId]: { markup: markupPercent } },
		} as unknown as Feature;

		const expectedCost = await getModelCreditCost({
			modelName: modelId,
			creditSystem: markupFeature,
			input: inputTokens,
			output: outputTokens,
		});
		const markupFreeCost = await getModelCreditCost({
			modelName: modelId,
			creditSystem: { model_markups: {} } as unknown as Feature,
			input: inputTokens,
			output: outputTokens,
		});
		expect(expectedCost).toBeCloseTo(
			new Decimal(markupFreeCost).mul(1.2).toNumber(),
			10,
		);

		const trackRes: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: featureId,
			model_id: modelId,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
		});

		expect(trackRes.value).toBeCloseTo(expectedCost, 10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[featureId]).toMatchObject({
			balance: new Decimal(1000).minus(expectedCost).toNumber(),
			usage: expectedCost,
		});

		let error: any;
		try {
			await autumnV2.post("/track_tokens", {
				customer_id: customerId,
				feature_id: TestFeature.Credits,
				model_id: modelId,
				input_tokens: 100,
				output_tokens: 50,
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeDefined();
		expect(error.message).toContain("not an AI credit system");
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-5: multiple tracks accumulate balance deductions")}`,
	async () => {
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
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const aiCreditFeature = ctx.features.find(
			(f) => f.id === TestFeature.AiCredits,
		);
		if (!aiCreditFeature) {
			throw new Error(`${TestFeature.AiCredits} feature not found`);
		}

		const cost1 = await getModelCreditCost({
			modelName: "custom/internal-model",
			creditSystem: aiCreditFeature,
			input: 5000,
			output: 2000,
		});

		await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 5000,
			output_tokens: 2000,
		});

		const cost2 = await getModelCreditCost({
			modelName: "custom/marked-up-model",
			creditSystem: aiCreditFeature,
			input: 3000,
			output: 1000,
		});

		await autumnV2.post("/track_tokens", {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-6: custom model missing input_cost/output_cost errors")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 1000,
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-6",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "missing input_cost or output_cost",
			func: () =>
				autumnV2_2.post("/track_tokens", {
					customer_id: customerId,
					feature_id: TestFeature.AiCredits,
					model_id: "custom/unconfigured-model",
					input_tokens: 100,
					output_tokens: 50,
				}),
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 1000,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-7: cache/audio/reasoning token pools are billed end-to-end")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 1000,
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem],
		});

		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "track-tokens-7",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const aiCreditFeature = ctx.features.find(
			(f) => f.id === TestFeature.AiCredits,
		);
		if (!aiCreditFeature) {
			throw new Error(`${TestFeature.AiCredits} feature not found`);
		}

		const modelId = await pickRandomModel({
			label: "track-tokens-7",
			requireCachePricing: true,
		});
		const pools = {
			input: 10000,
			output: 5000,
			cacheRead: 20000,
			cacheWrite: 8000,
			audioInput: 1000,
			audioOutput: 1000,
			reasoning: 4000,
		};

		const expectedCost = await getModelCreditCost({
			modelName: modelId,
			creditSystem: aiCreditFeature,
			...pools,
		});

		const textOnlyCost = await getModelCreditCost({
			modelName: modelId,
			creditSystem: aiCreditFeature,
			input: pools.input,
			output: pools.output,
		});
		expect(expectedCost).toBeGreaterThan(textOnlyCost);

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: modelId,
			input_tokens: pools.input,
			output_tokens: pools.output,
			cache_read_tokens: pools.cacheRead,
			cache_write_tokens: pools.cacheWrite,
			audio_input_tokens: pools.audioInput,
			audio_output_tokens: pools.audioOutput,
			reasoning_tokens: pools.reasoning,
		});

		expect(trackRes.value).toBeCloseTo(expectedCost, 10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: new Decimal(1000).minus(expectedCost).toNumber(),
			usage: expectedCost,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-8: custom models ignore cache/audio/reasoning pools")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 1000,
		});
		const freeProd = products.base({
			id: "free",
			items: [aiCreditsItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-8",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const expectedCost = new Decimal(5)
			.mul(10000)
			.add(new Decimal(15).mul(5000))
			.div(1_000_000)
			.toNumber();

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
			cache_read_tokens: 20000,
			cache_write_tokens: 8000,
			audio_input_tokens: 1000,
			audio_output_tokens: 1000,
			reasoning_tokens: 4000,
		});

		expect(trackRes.value).toBeCloseTo(expectedCost, 10);
	},
);
