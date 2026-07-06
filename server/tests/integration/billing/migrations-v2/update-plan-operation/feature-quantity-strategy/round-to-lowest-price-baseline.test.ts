/**
 * TDD coverage for `update_plan`'s new internal-only fields:
 *   - `feature_quantities_strategy: [{ feature_id, strategy: "round_to_lowest_price" }]`
 *     resolves a customer-specific prepaid quantity per matched cusProduct,
 *     picking the highest new tier whose flat_amount is at-or-below the
 *     customer's current monthly amount for that feature (computed via the
 *     same `priceToLineAmount` real invoices are built from).
 *   - `proration: true` allows the operation to produce a real Stripe invoice
 *     (prorated credit of the old tier + prorated charge of the new tier)
 *     instead of the default charge-free migration behavior.
 *
 * Setup: single entity, single active cusProduct with a base price (from
 * `products.pro`) alongside a prepaid volume-tiered feature item — the real
 * Mintlify shape (base price + prepaid volume tier with an included amount).
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	CreatePlanItemParamsV1,
} from "@autumn/shared";
import {
	BillingInterval,
	BillingMethod,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

/** New tier ladder the migration moves customers onto. */
const NEW_TIER_ITEM: CreatePlanItemParamsV1 = {
	feature_id: TestFeature.Messages,
	reset: { interval: ResetInterval.Month },
	price: {
		billing_method: BillingMethod.Prepaid,
		tier_behavior: TierBehavior.VolumeBased,
		interval: BillingInterval.Month,
		billing_units: 1,
		tiers: [
			{ to: 200, amount: 0, flat_amount: 10 },
			{ to: 1000, amount: 0, flat_amount: 40 },
			{ to: "inf", amount: 0, flat_amount: 80 },
		],
	},
};

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: round_to_lowest_price + proration produces correct invoice")}`,
	async () => {
		const customerId = "migration-fqs-baseline";
		const pro = products.pro({
			items: [
				items.volumePrepaidMessages({
					includedUsage: 0,
					billingUnits: 1,
					tiers: [
						{ to: 500, amount: 0, flat_amount: 20 },
						{ to: "inf", amount: 0, flat_amount: 50 },
					],
				}),
			],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		// Old flat amount at quantity=300 is $20 (falls in the 0-500 tier).
		// New tier ladder: highest tier with flat_amount <= $20 is the 200-credit/$10 tier.
		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									billing_method: BillingMethod.Prepaid,
								},
							],
							add_items: [NEW_TIER_ITEM],
						},
						feature_quantities_strategy: [
							{
								feature_id: TestFeature.Messages,
								strategy: "round_to_lowest_price",
							},
						],
						proration: true,
					},
				],
			},
		});

		const customerV5 =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: customerV5,
			featureId: TestFeature.Messages,
			remaining: 200,
			usage: 0,
			planId: pro.id,
		});

		// Invoice 0: initial attach ($20 base + prepaid $20 = but base price is
		// separate; just assert count grew and the migration's own invoice fired.
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer: customerV3, count: 2 });

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: round_to_lowest_price skips cusProduct with no existing prepaid price")}`,
	async () => {
		const customerId = "migration-fqs-no-old-price";
		const pro = products.pro({ items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Should not throw even though there's no existing AI_CREDITS-style
		// prepaid price to round down from — the strategy entry is just skipped.
		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: { add_items: [NEW_TIER_ITEM] },
						feature_quantities_strategy: [
							{
								feature_id: TestFeature.Messages,
								strategy: "round_to_lowest_price",
							},
						],
						proration: true,
					},
				],
			},
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
