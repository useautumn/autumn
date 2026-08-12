/**
 * catalogV2.update — create PRICED plan item shapes across the billing-model
 * matrix: consumable prepaid, allocated prepaid, consumable usage-based, and
 * allocated usage-based (arrear / "v2"; prorated "v1" is not creatable via
 * these params — proration + usage_based is rejected in plan-errors).
 *
 * Contract: each price field round-trips through catalogV2.get after create.
 */

import { expect, test } from "bun:test";
import {
	AllocatedBillingBehavior,
	BillingInterval,
	BillingMethod,
	isFixedPrice,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import { createAndAssert } from "./utils/createAndAssert.js";

// ─── Consumable usage-based ──────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: consumable usage-based — reset + priced (matched intervals)")}`,
	async () => {
		const planId = uniqueTestId("cv2_rppu");
		await createAndAssert({
			planId,
			name: "Reset + Usage",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
					price: {
						amount: 0.5,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
					price: {
						amount: 0.5,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: consumable usage-based — graduated tiers")}`,
	async () => {
		const planId = uniqueTestId("cv2_grad");
		await createAndAssert({
			planId,
			name: "Graduated Tiers",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					price: {
						tiers: [
							{ to: 500, amount: 0.1 },
							{ to: 2000, amount: 0.05 },
							{ to: TierInfinite, amount: 0.02 },
						],
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					price: {
						tiers: [
							{ to: 500, amount: 0.1 },
							{ to: 2000, amount: 0.05 },
							{ to: TierInfinite, amount: 0.02 },
						],
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
		});
	},
);

// ─── Consumable prepaid ──────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: consumable prepaid — flat + billing_units + max_purchase")}`,
	async () => {
		const planId = uniqueTestId("cv2_pp");
		await createAndAssert({
			planId,
			name: "Prepaid Flat",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
						max_purchase: 500,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
						max_purchase: 500,
					},
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: prepaid price.interval differs from reset.interval")}`,
	async () => {
		const planId = uniqueTestId("cv2_ppdiff");
		await createAndAssert({
			planId,
			name: "Prepaid Diff Intervals",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
					price: {
						amount: 15,
						interval: BillingInterval.Year,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
					price: {
						amount: 15,
						interval: BillingInterval.Year,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
					},
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: volume tiers + flat_amount (prepaid)")}`,
	async () => {
		const planId = uniqueTestId("cv2_vol");
		await createAndAssert({
			planId,
			name: "Volume Flat",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					price: {
						tiers: [
							{ to: 600, amount: 10, flat_amount: 5 },
							{ to: TierInfinite, amount: 5, flat_amount: 0 },
						],
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					price: {
						tiers: [
							{ to: 600, amount: 10, flat_amount: 5 },
							{ to: TierInfinite, amount: 5, flat_amount: 0 },
						],
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
					},
				},
			],
		});
	},
);

// ─── Allocated prepaid (continuous-use feature + prepaid) ────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: allocated prepaid — proration on_increase / on_decrease")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pror");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Prepaid Proration",
					items: [
						{
							feature_id: TestFeature.Users,
							included: 0,
							price: {
								amount: 10,
								interval: BillingInterval.Month,
								billing_method: BillingMethod.Prepaid,
								billing_units: 1,
							},
							proration: {
								on_increase: OnIncrease.ProrateImmediately,
								on_decrease: OnDecrease.NoProrations,
							},
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			// catalogV2.get strips proration (productV2ToApiPlanV1); assert DB row.
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: TestFeature.Users,
								price: {
									amount: 10,
									billing_method: BillingMethod.Prepaid,
								},
							},
						],
					},
				],
			});
			const full = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const usagePrice = full.prices.find((price) => !isFixedPrice(price));
			expect(usagePrice?.proration_config).toMatchObject({
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.NoProrations,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// ─── Allocated usage-based (arrear / "v2") ───────────────────────────────────

// Continuous-use feature + usage_based with no proration knobs resolves to
// allocated arrear billing: never resets, bills holdings at cycle end.
test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: allocated usage-based (arrear) — behavior + should_prorate false")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_alloc_v2");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Allocated Arrear",
					items: [
						{
							feature_id: TestFeature.Users,
							included: 2,
							price: {
								amount: 10,
								interval: BillingInterval.Month,
								billing_method: BillingMethod.UsageBased,
								billing_units: 1,
							},
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: TestFeature.Users,
								included: 2,
								price: {
									amount: 10,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.UsageBased,
								},
							},
						],
					},
				],
			});

			const full = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const usagePrice = full.prices.find((price) => !isFixedPrice(price));
			const config = usagePrice?.config as {
				allocated_billing_behavior?: string;
				should_prorate?: boolean;
			};
			expect(config?.allocated_billing_behavior).toBe(
				AllocatedBillingBehavior.Arrear,
			);
			expect(config?.should_prorate).toBe(false);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// ─── stripe_price_id threading (internal param) ──────────────────────────────

// stripe_price_id is internal-only but raw API calls must thread it through to
// the price config so sync flows can preserve existing Stripe prices.
test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: price.stripe_price_id threaded to price config")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_spid");
		const stripePriceId = `price_stub_${planId}`;
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Stripe Price Threaded",
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Month },
							price: {
								stripe_price_id: stripePriceId,
								amount: 0.5,
								interval: BillingInterval.Month,
								billing_method: BillingMethod.UsageBased,
								billing_units: 1,
							},
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			const full = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const usagePrice = full.prices.find((price) => !isFixedPrice(price));
			const config = usagePrice?.config as { stripe_price_id?: string | null };
			expect(config?.stripe_price_id).toBe(stripePriceId);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// ─── Multi-currency + base price extras ──────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: additional_currencies on flat amount + tiers")}`,
	async () => {
		const planId = uniqueTestId("cv2_mc");
		await createAndAssert({
			planId,
			name: "Multi Currency Items",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
						additional_currencies: [{ currency: "eur", amount: 9 }],
					},
				},
				{
					feature_id: TestFeature.Words,
					included: 100,
					price: {
						tiers: [
							{
								to: 1000,
								amount: 0.5,
								additional_currencies: [{ currency: "eur", amount: 0.4 }],
							},
							{
								to: TierInfinite,
								amount: 0.3,
								additional_currencies: [{ currency: "eur", amount: 0.25 }],
							},
						],
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					price: {
						amount: 10,
						additional_currencies: [{ currency: "eur", amount: 9 }],
					},
				},
				{
					feature_id: TestFeature.Words,
					price: {
						tiers: [
							{
								to: 1000,
								amount: 0.5,
								additional_currencies: [{ currency: "eur", amount: 0.4 }],
							},
							{
								to: TierInfinite,
								amount: 0.3,
								additional_currencies: [{ currency: "eur", amount: 0.25 }],
							},
						],
					},
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: base price interval_count 3 + additional_currencies")}`,
	async () => {
		const planId = uniqueTestId("cv2_base");
		await createAndAssert({
			planId,
			name: "Base Price Extras",
			price: {
				amount: 30,
				interval: BillingInterval.Month,
				interval_count: 3,
				additional_currencies: [{ currency: "eur", amount: 27 }],
			},
			items: [{ feature_id: TestFeature.Dashboard }],
			expectedItems: [{ feature_id: TestFeature.Dashboard }],
			expectedBasePrice: {
				amount: 30,
				interval: BillingInterval.Month,
				interval_count: 3,
				additional_currencies: [{ currency: "eur", amount: 27 }],
			},
		});
	},
);
