import { expect, test } from "bun:test";

import type { ApiCustomerV5, TrackResponseV3 } from "@autumn/shared";
import { ApiVersion, ErrCode, ResetInterval } from "@autumn/shared";
import { setCustomerUsageLimit } from "@tests/integration/balances/utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("track-tokens-lim-1: default behavior caps token deduction at zero balance")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 0.1,
		});
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-lim-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackRes1: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 5000,
			output_tokens: 2500,
		});
		expect(trackRes1.value).toBeCloseTo(0.0625, 10);

		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 0,
			usage: 0.1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-lim-2: overage_behavior reject errors with InsufficientBalance")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 0.1,
		});
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-lim-2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_2.post("/track_tokens", {
					customer_id: customerId,
					feature_id: TestFeature.AiCredits,
					model_id: "custom/internal-model",
					input_tokens: 10000,
					output_tokens: 5000,
					overage_behavior: "reject",
				}),
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 0.1,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-lim-3: explicit overage_behavior cap deducts up to zero")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 0.1,
		});
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-lim-3",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
			overage_behavior: "cap",
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 0,
			usage: 0.1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-lim-4: unlimited AI credit balance never rejects, usage accumulates")}`,
	async () => {
		const aiCreditsItem = items.unlimited({ featureId: TestFeature.AiCredits });
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-lim-4",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
		});

		expect(trackRes.value).toBeCloseTo(0.125, 10);
		expect(trackRes.balance).toMatchObject({
			feature_id: TestFeature.AiCredits,
			unlimited: true,
			usage: 0.125,
		});

		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 20000,
			output_tokens: 10000,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.AiCredits]).toMatchObject({
			unlimited: true,
			usage: 0.375,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-lim-5: duplicate idempotency_key rejected, deducts once")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 1000,
		});
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-lim-5",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const body = {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
			idempotency_key: `track-tokens-idem-${Date.now().toString(36)}`,
		};

		const trackRes: TrackResponseV3 = await autumnV2_2.post(
			"/track_tokens",
			body,
		);
		expect(trackRes.value).toBeCloseTo(0.125, 10);

		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: () => autumnV2_2.post("/track_tokens", body),
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 999.875,
			usage: 0.125,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-lim-6: usage limit counts AI credits consumed, not call count")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 1000,
		});
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId } = await initScenario({
			customerId: "track-tokens-lim-6",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.AiCredits,
			limit: 100,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 999.875,
			usage: 0.125,
		});
		expectUsageLimitCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			usage: 0.125,
			limit: 100,
			interval: ResetInterval.Day,
		});
	},
);
