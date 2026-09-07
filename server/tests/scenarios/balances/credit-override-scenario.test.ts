import { test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Dashboard fixture for QAing plan-item feature_overrides.
 *
 * Builds four plans over two credit systems — one AI (markup override) and one
 * classic (rate-card override) — and attaches a customer to each, so every
 * override shape can be inspected in the dashboard rather than read in code.
 *
 * AiCreditsTiered catalog chain: default 10%, `custom` provider 30%,
 * custom/override-model 5% per-model. Both custom models bill $10/M in,
 * $20/M out, so 10k in + 5k out has a base cost of $0.20.
 */

const withOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

const INPUT_TOKENS = 10_000;
const OUTPUT_TOKENS = 5_000;

test(
	`${chalk.yellowBright("scenario: credit system overrides (markups + rate card)")}`,
	async () => {
		const aiItem = () =>
			items.free({
				featureId: TestFeature.AiCreditsTiered,
				includedUsage: 1_000,
			});

		// No override — the control. The feature's own chain applies.
		const standard = products.base({
			id: "qa-standard",
			items: [aiItem()],
		});

		// Every markup level zeroed: this plan bills at cost.
		const enterprise = products.base({
			id: "qa-enterprise",
			items: [
				withOverride(aiItem(), {
					markups: {
						default_markup: 0,
						provider_markups: { custom: { markup: 0 } },
					},
				}),
			],
		});

		// Only the default is set. The catalog's per-model 5% and provider 30%
		// must NOT survive — the chain replaces as one unit.
		const flat50 = products.base({
			id: "qa-flat50",
			items: [withOverride(aiItem(), { markups: { default_markup: 50 } })],
		});

		// Classic rate card: Action1 repriced 0.2 → 0.5 credits.
		const cheapActions = products.base({
			id: "qa-rate-card",
			items: [
				withOverride(
					items.free({ featureId: TestFeature.Credits, includedUsage: 500 }),
					{
						schema: [
							{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
						],
					},
				),
			],
		});

		const { customerId, autumnV1, autumnV2 } = await initScenario({
			customerId: "qa-standard",
			setup: [
				s.customer({ testClock: false }),
				s.products({
					list: [standard, enterprise, flat50, cheapActions],
				}),
			],
			actions: [s.attach({ productId: standard.id })],
		});

		const trackTokens = async ({
			customer,
			model,
		}: {
			customer: string;
			model: string;
		}) => {
			const res = await autumnV2.post("/track_tokens", {
				customer_id: customer,
				feature_id: TestFeature.AiCreditsTiered,
				model_id: model,
				input_tokens: INPUT_TOKENS,
				output_tokens: OUTPUT_TOKENS,
			});
			return res.value as number;
		};

		const setupCustomer = async ({
			id,
			productId,
		}: {
			id: string;
			productId: string;
		}) => {
			await autumnV1.createCustomer({
				id,
				name: id,
				email: `${id}@example.com`,
			});
			await autumnV1.attach({ customer_id: id, product_id: productId });
			return id;
		};

		const enterpriseId = await setupCustomer({
			id: "qa-enterprise",
			productId: enterprise.id,
		});
		const flat50Id = await setupCustomer({
			id: "qa-flat50",
			productId: flat50.id,
		});
		const rateCardId = await setupCustomer({
			id: "qa-rate-card",
			productId: cheapActions.id,
		});

		// Same model, same tokens, three different plans.
		const standardCost = await trackTokens({
			customer: customerId,
			model: "custom/provider-fallback-model",
		});
		const enterpriseCost = await trackTokens({
			customer: enterpriseId,
			model: "custom/provider-fallback-model",
		});
		const flat50Cost = await trackTokens({
			customer: flat50Id,
			model: "custom/override-model",
		});

		await autumnV1.track({
			customer_id: rateCardId,
			feature_id: TestFeature.Action1,
			value: 100,
		});

		const rateCardCustomer =
			await autumnV1.customers.get<ApiCustomerV3>(rateCardId);

		console.log("\ncredit override scenario:", {
			aiCreditSystem: TestFeature.AiCreditsTiered,
			catalogChain: "default 10% · custom provider 30% · override-model 5%",
			baseCostPerCall: 0.2,
			markupOverrides: {
				"qa-standard (no override)": `${standardCost} — expect 0.26 (30% provider)`,
				"qa-enterprise (all levels 0%)": `${enterpriseCost} — expect 0.20 (at cost)`,
				"qa-flat50 (default 50% only)": `${flat50Cost} — expect 0.30, NOT 0.21 (per-model 5% dropped)`,
			},
			rateCardOverride: {
				customer: rateCardId,
				creditSystem: TestFeature.Credits,
				catalogRate: "0.2 credits per Action1",
				overrideRate: "0.5 credits per Action1",
				tracked: "100 Action1 → expect 50 credits used, balance 450",
				balance: rateCardCustomer.features[TestFeature.Credits]?.balance,
			},
		});
	},
	{ timeout: 240_000 },
);
