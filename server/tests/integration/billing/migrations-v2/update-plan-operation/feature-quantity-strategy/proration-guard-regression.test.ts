/**
 * Regression coverage: `proration` defaults to false/absent, which must keep
 * default migration behavior exactly charge-free — same tier-swap +
 * `feature_quantities_strategy` operation that produces a real invoice under
 * `proration: true` (see round-to-lowest-price-baseline.test.ts) must instead
 * resolve with zero charges when `proration` is omitted, proving the new
 * fields are strictly additive/opt-in and don't weaken the existing
 * `assertNoChargeArtifacts`/`assertStripePlanNoCharges` guards for every
 * migration that doesn't opt in.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, CreatePlanItemParamsV1 } from "@autumn/shared";
import {
	BillingInterval,
	BillingMethod,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
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
	`${chalk.yellowBright("migrations update_plan: proration absent stays charge-free (regression)")}`,
	async () => {
		const customerId = "migration-proration-absent";
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

		// No `proration` field at all — default must stay exactly charge-free.
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
					},
				],
			},
		});

		// Only the initial attach invoice exists — the migration itself charged nothing.
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer, count: 1 });
	},
);
