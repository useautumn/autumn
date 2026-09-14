import { test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	logPlaybook,
	resetCatalogFeatures,
	resetCatalogPlans,
} from "../utils/catalogScenario.js";

/**
 * Dashboard fixture for QAing the rate-card editor release: per-row
 * dimensions, expand-on-select, removing the last row, no Stripe product
 * field, and everything visible to non-admins.
 */

const smallId = "qa-rc-small";
const largeId = "qa-rc-large";
const tokensId = "qa-rc-tokens";
const mixedCreditsId = "qa-rc-mixed";
const singleCreditsId = "qa-rc-single";
const stripeCreditsId = "qa-rc-stripe";
const planId = "qa-rc-plan";

const metered = (featureId: string, name: string) => ({
	feature_id: featureId,
	name,
	type: FeatureType.Metered,
	consumable: true,
});

const plainRow = { metered_feature_id: smallId, credit_cost: 1 };

const dimensionedRow = {
	metered_feature_id: largeId,
	credit_cost: 1,
	dimensions: {
		size_large: { match: { size: "large" }, credit_cost: 16 },
		size_large_region_eu: {
			match: { size: "large", region: "eu" },
			credit_cost: 20,
		},
		size_xl: {
			match: { size: "xl" },
			tier_behavior: "graduated" as const,
			tiers: [
				{ to: 5, credit_cost: 2 },
				{ to: "inf" as const, credit_cost: 1 },
			],
		},
	},
	multipliers: {
		lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
	},
};

const graduatedRow = {
	metered_feature_id: tokensId,
	billing_units: 1_000,
	tier_behavior: "graduated" as const,
	tiers: [
		{ to: 10_000, credit_cost: 1 },
		{ to: "inf" as const, credit_cost: 0.5 },
	],
};

test(`${chalk.yellowBright("catalog-qa: rate-card editor")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [planId] });
	await resetCatalogFeatures({
		ctx,
		featureIds: [
			mixedCreditsId,
			singleCreditsId,
			stripeCreditsId,
			smallId,
			largeId,
			tokensId,
		],
	});

	const stripeProduct = await ctx.stripeCli.products.create({
		name: "QA rate card Stripe product",
	});

	await autumnV2_3.catalogV2.update({
		features: [
			metered(smallId, "QA Small Action"),
			metered(largeId, "QA Large Action"),
			metered(tokensId, "QA Tokens"),
			{
				feature_id: mixedCreditsId,
				name: "QA Mixed Credits",
				type: FeatureType.CreditSystem,
				credit_schema: [plainRow, dimensionedRow, graduatedRow],
			},
			{
				feature_id: singleCreditsId,
				name: "QA Single Row Credits",
				type: FeatureType.CreditSystem,
				credit_schema: [plainRow],
			},
			{
				feature_id: stripeCreditsId,
				name: "QA Stripe Mapped Credits",
				type: FeatureType.CreditSystem,
				credit_schema: [plainRow],
				processors: { stripe: { product_id: stripeProduct.id } },
			},
		],
		plans: [
			{
				plan_id: planId,
				name: "QA Rate Card Plan",
				items: [
					{
						feature_id: mixedCreditsId,
						included: 1_000,
						feature_override: {
							credit_schema: [
								plainRow,
								{ ...dimensionedRow, credit_cost: 2 },
								graduatedRow,
							],
						},
					},
					{ feature_id: singleCreditsId, included: 100 },
				],
			},
		],
	});

	logPlaybook({
		title: "Rate-card editor release",
		steps: [
			`Features → "QA Mixed Credits" → only the Large row is expanded-with-Dimensions on; Small and Tokens rows have the switch off and no tables.`,
			`Same sheet → expand Small → switch Dimensions on → tables appear under Small only; switch off → Large keeps size_large / size_large_region_eu / size_xl / lifecycle_spot.`,
			`Same sheet → the whole card has NO card-level "Dimensions" or "Invoice credits" section between the tabs and the rate card (invoice credits is admin-only until its own PR).`,
			`Create Credit System → pick a feature on the seeded first row → credit cost / billing units / Add Tier appear immediately, no second click.`,
			`Features → "QA Single Row Credits" → remove its only row → no toast, the card is just "Add feature"; Update credit system → "Add at least one feature to the rate card".`,
			`Features → any metered feature → Advanced only has Event Names; "QA Mixed Credits" has no Advanced section and no "Stripe Product (optional)".`,
			`Features → "QA Stripe Mapped Credits" → rename and save → feature still maps to Stripe product ${stripeProduct.id} (atmn pull --include-mappings, or features.stripe_product_id in the DB).`,
			`Plans → "QA Rate Card Plan" → QA Mixed Credits item → Advanced → Custom rate card: Large row shows its own Dimensions on with credit cost 2; Small / Tokens off. Override still saves with dimensions.`,
			`Log in as a non-admin → billing units, Add Tier, per-row Dimensions and the plan-item Custom rate card are all visible and editable.`,
		],
	});
});
