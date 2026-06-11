import { expect, test } from "bun:test";

import type {
	ApiCustomerV5,
	ApiEntityV2,
	TrackResponseV3,
} from "@autumn/shared";
import { ApiVersion, FeatureType } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// custom/internal-model: input_cost=5 $/M, output_cost=15 $/M, markup=0%

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-RES-1: entity_id deducts entity balance via auto-resolution
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-res-1: entity_id deducts entity balance via auto-resolution")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const freeProd = products.base({ id: "free", items: [aiCreditsItem] });

		const { customerId, autumnV2_2, entities } = await initScenario({
			customerId: "track-tokens-res-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// No feature_id — exercises AI credit auto-resolution with entity scoping
		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			entity_id: entities[0].id,
			model_id: "custom/internal-model",
			input_tokens: 10000,
			output_tokens: 5000,
		});

		expect(trackRes.customer_id).toBe(customerId);
		expect(trackRes.value).toBeCloseTo(0.125, 10);

		const entity0 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity0,
			featureId: TestFeature.AiCredits,
			remaining: 99.875,
			usage: 0.125,
		});

		const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		expectBalanceCorrect({
			customer: entity1,
			featureId: TestFeature.AiCredits,
			remaining: 100,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// TRACK-TOKENS-RES-2: updated model markup applies to subsequent tracks
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-res-2: updated model markup applies to subsequent tracks")}`,
	async () => {
		const autumn = new AutumnInt({ version: ApiVersion.V2_2 });

		// Throwaway feature — never mutate the shared AiCredits fixtures
		const featureId = `ai_credits_mut_${Date.now()}_${Math.random()
			.toString(36)
			.slice(2, 8)}`;
		await autumn.post("/features.create", {
			feature_id: featureId,
			name: "AI Credits Mutable",
			type: FeatureType.AiCreditSystem,
			model_markups: {
				"custom/mut-model": { markup: 0, input_cost: 10, output_cost: 20 },
			},
		});

		const aiCreditsItem = items.free({ featureId, includedUsage: 1000 });
		const freeProd = products.base({ id: "free-mut", items: [aiCreditsItem] });

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-res-2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const trackBody = {
			customer_id: customerId,
			feature_id: featureId,
			model_id: "custom/mut-model",
			input_tokens: 10000,
			output_tokens: 5000,
		};

		// Markup 0 → base cost (10*10000 + 20*5000)/1e6 = 0.2
		const trackRes1: TrackResponseV3 = await autumnV2_2.post(
			"/track_tokens",
			trackBody,
		);
		expect(trackRes1.value).toBeCloseTo(0.2, 10);

		// Bump the model markup to 100%
		await autumn.post("/features.update", {
			feature_id: featureId,
			model_markups: {
				"custom/mut-model": { markup: 100, input_cost: 10, output_cost: 20 },
			},
		});

		// Explicit feature_id resolves from freshly loaded org features → 0.4
		const trackRes2: TrackResponseV3 = await autumnV2_2.post(
			"/track_tokens",
			trackBody,
		);
		expect(trackRes2.value).toBeCloseTo(0.4, 10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId,
			remaining: 999.4,
			usage: 0.6,
		});
	},
);
