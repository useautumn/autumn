/**
 * Contract: a plan item's feature_override.markups supersedes the AI credit
 * system's own markup chain for customers attached through that item. The
 * override replaces the whole chain, so a level it leaves unset means "no
 * markup" rather than inheriting the feature's value.
 */

import { expect, test } from "bun:test";

import type {
	ApiCustomerV3,
	FeatureConfigOverride,
	TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// AiCreditsTiered: defaultMarkup=10, providerMarkups.custom=30,
// model_markups["custom/override-model"]=5. custom/* models price from their
// own input_cost/output_cost, so no models.dev fetch is involved.
const INPUT_TOKENS = 10_000;
const OUTPUT_TOKENS = 5_000;

// custom/provider-fallback-model: $10/M in, $20/M out.
const baseCost = new Decimal(10)
	.mul(INPUT_TOKENS)
	.add(new Decimal(20).mul(OUTPUT_TOKENS))
	.div(1_000_000);

const withMarkupsOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("track-tokens-markup-override: plan markup override wins over the feature's chain")}`,
	async () => {
		const aiCreditsItem = withMarkupsOverride(
			items.free({
				featureId: TestFeature.AiCreditsTiered,
				includedUsage: 1000,
			}),
			{
				markups: {
					default_markup: 0,
					provider_markups: { custom: { markup: 0 } },
				},
			},
		);
		const enterpriseProd = products.base({
			id: "enterprise",
			items: [aiCreditsItem],
		});

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "track-tokens-markup-override",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [enterpriseProd] }),
			],
			actions: [s.attach({ productId: enterpriseProd.id })],
		});

		// Provider markup is overridden to 0, so cost is the base — not the
		// feature's 30% provider markup.
		const res: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCreditsTiered,
			model_id: "custom/provider-fallback-model",
			input_tokens: INPUT_TOKENS,
			output_tokens: OUTPUT_TOKENS,
		});

		expect(res.value).toBeCloseTo(baseCost.toNumber(), 10);
		expect(res.value).not.toBeCloseTo(baseCost.mul(1.3).toNumber(), 10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.AiCreditsTiered]).toMatchObject({
			balance: new Decimal(1000).minus(baseCost).toNumber(),
			usage: baseCost.toNumber(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-markup-override: the override replaces the whole chain, not one level")}`,
	async () => {
		// Only default_markup is set. The feature's per-model 5% and provider 30%
		// must NOT survive — an unset level means no markup at that level.
		const aiCreditsItem = withMarkupsOverride(
			items.free({
				featureId: TestFeature.AiCreditsTiered,
				includedUsage: 1000,
			}),
			{ markups: { default_markup: 50 } },
		);
		const prod = products.base({ id: "flat50", items: [aiCreditsItem] });

		const { customerId, autumnV2 } = await initScenario({
			customerId: "track-tokens-markup-override-replaces",
			setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
			actions: [s.attach({ productId: prod.id })],
		});

		// custom/override-model carries a 5% per-model markup on the feature and
		// the same $10/M in, $20/M out cost basis, so base = 0.20. The cost basis
		// survives the override (it defines the model); only the markup is replaced.
		const overrideModelBase = baseCost;

		const res: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCreditsTiered,
			model_id: "custom/override-model",
			input_tokens: INPUT_TOKENS,
			output_tokens: OUTPUT_TOKENS,
		});

		expect(res.value).toBeCloseTo(overrideModelBase.mul(1.5).toNumber(), 10);
		expect(res.value).not.toBeCloseTo(
			overrideModelBase.mul(1.05).toNumber(),
			10,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-markup-override: an un-overridden plan still uses the feature's chain")}`,
	async () => {
		const prod = products.base({
			id: "standard",
			items: [
				items.free({
					featureId: TestFeature.AiCreditsTiered,
					includedUsage: 1000,
				}),
			],
		});

		const { customerId, autumnV2 } = await initScenario({
			customerId: "track-tokens-markup-no-override",
			setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
			actions: [s.attach({ productId: prod.id })],
		});

		const res: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCreditsTiered,
			model_id: "custom/provider-fallback-model",
			input_tokens: INPUT_TOKENS,
			output_tokens: OUTPUT_TOKENS,
		});

		// Unchanged behaviour: the feature's own 30% provider markup applies.
		expect(res.value).toBeCloseTo(baseCost.mul(1.3).toNumber(), 10);
	},
);
