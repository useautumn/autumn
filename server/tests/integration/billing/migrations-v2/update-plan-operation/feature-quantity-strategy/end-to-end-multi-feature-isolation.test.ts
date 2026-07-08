/**
 * End-to-end coverage for a cusProduct with MULTIPLE prepaid features, only
 * one of which is targeted by this migration's `feature_quantities_strategy`.
 * Directly validates (with a runnable test, not just code inspection) that
 * the untouched feature's quantity AND usage are fully preserved — no
 * cross-feature interference from `setupFeatureQuantitiesContext`'s
 * per-feature independent resolution.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5, CreatePlanItemParamsV1 } from "@autumn/shared";
import { BillingInterval, BillingMethod, ResetInterval, TierBehavior } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

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
			{ to: "inf", amount: 0, flat_amount: 80 },
		],
	},
};

test.concurrent(
	`${chalk.yellowBright("migrations end-to-end: cusProduct with 2 prepaid features, only migrated feature changes")}`,
	async () => {
		const customerId = "migration-e2e-multi-feature-isolation";
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
				items.prepaidUsers({ includedUsage: 0, billingUnits: 1 }),
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
					options: [
						{ feature_id: TestFeature.Messages, quantity: 300 },
						{ feature_id: TestFeature.Users, quantity: 5 },
					],
				}),
				s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
				s.track({ featureId: TestFeature.Users, value: 2, timeout: 2000 }),
			],
		});

		const invoiceCountBefore =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;

		// Migration only touches Messages (AI_CREDITS-analogue) — Users (Seats-analogue)
		// is never named in customize or feature_quantities_strategy.
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
							{ feature_id: TestFeature.Messages, strategy: "round_to_lowest_price" },
						],
						proration: true,
					},
				],
			},
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		// Migrated feature: 300 -> $20 old tier -> new 200/$10 tier, usage carries.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 150,
			usage: 50,
			planId: pro.id,
		});

		// Untouched feature: quantity AND usage completely unaffected.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			granted: 5,
			remaining: 3,
			usage: 2,
			planId: pro.id,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// Net proration for Messages only: -$20 (credit 300) + $10 (charge 200) = -$10.
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: invoiceCountBefore + 1,
			latestTotal: -10,
		});
	},
);
