/**
 * End-to-end coverage combining multiple real Mintlify dimensions AT ONCE
 * (not in isolation), per explicit request — a customer with multi-entity AND
 * an active+scheduled pair, verifying ALL of: invoice, feature quantity,
 * customer_products (both immediate and scheduled), and usage carry-forward
 * in a single migration run. Isolated single-dimension tests wouldn't catch
 * bugs that only show up when these interact.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5, CreatePlanItemParamsV1 } from "@autumn/shared";
import { BillingInterval, BillingMethod, ResetInterval, TierBehavior } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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
			{ to: 1000, amount: 0, flat_amount: 40 },
			{ to: "inf", amount: 0, flat_amount: 80 },
		],
	},
};

const oldVolumeItem = () =>
	items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: 500, amount: 0, flat_amount: 20 },
			{ to: "inf", amount: 0, flat_amount: 50 },
		],
	});

test.concurrent(
	`${chalk.yellowBright("migrations end-to-end: multi-entity + active/scheduled pair + usage all correct after migration")}`,
	async () => {
		const customerId = "migration-e2e-multi-entity-schedule-usage";
		const premium = products.premium({ items: [oldVolumeItem()] });
		const pro = products.pro({ items: [oldVolumeItem()] });

		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				// Entity 0: single active cusProduct, no schedule.
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 50,
					entityIndex: 0,
					timeout: 2000,
				}),
				// Entity 1: active premium, usage tracked, THEN a scheduled downgrade
				// to pro queued behind it (both share one Stripe subscription).
				s.billing.attach({
					productId: premium.id,
					entityIndex: 1,
					options: [{ feature_id: TestFeature.Messages, quantity: 700 }],
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 1,
					timeout: 2000,
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 1,
					options: [{ feature_id: TestFeature.Messages, quantity: 1000 }],
					timeout: 4000,
				}),
			],
		});
		expect(entities.length).toBe(2);

		const invoiceCountBefore =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: {
				customer: {
					plan: { $or: [{ plan_id: premium.id }, { plan_id: pro.id }] },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							$or: [{ plan_id: premium.id }, { plan_id: pro.id }],
						},
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

		// ── 1. Feature quantity + usage carry-forward, per entity ──────────
		const entity0 = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[0].id,
		);
		// 300 -> $20 old tier -> new 200/$10 tier. Usage (50) must carry forward.
		expectBalanceCorrect({
			customer: entity0,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 150,
			usage: 50,
			planId: pro.id,
		});

		const entity1 = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[1].id,
		);
		// Active (premium) side: 700 -> $50 old tier -> new 1000/$40 tier.
		// Usage (200) tracked against the active premium cusProduct must carry forward.
		expectBalanceCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			granted: 1000,
			remaining: 800,
			usage: 200,
			planId: premium.id,
		});

		// ── 2. customer_products: both immediate (canceling->new) and scheduled ──
		// `pro.id` is active on entity0 but simultaneously scheduled on entity1 —
		// a customer-level `expectCustomerProducts` check can't express that split,
		// so each entity is asserted against its own cusProduct state.
		await expectProductActive({ customer: entity0, productId: pro.id });
		await expectProductCanceling({ customer: entity1, productId: premium.id });
		await expectProductScheduled({ customer: entity1, productId: pro.id });

		// ── 3. Whole Stripe state (both the active sub items AND the scheduled
		// phase) must match Autumn in one shot — this is exactly what
		// `migrateCustomer` restoring the full customer state in one go buys us.
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// ── 4. Invoice: net proration across BOTH entities' AI_CREDITS swap.
		// Entity 0: -$20 (credit unused 300) + $10 (charge 200) = -$10.
		// Entity 1 (active premium only — the scheduled pro phase doesn't bill
		// immediately): -$50 (credit unused 700) + $40 (charge 1000) = -$10.
		// Net migration invoice: -$20.
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: invoiceCountBefore + 1,
			latestTotal: -20,
		});
	},
);
