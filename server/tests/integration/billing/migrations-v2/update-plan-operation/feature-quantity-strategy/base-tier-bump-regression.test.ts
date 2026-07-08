/**
 * Documents Mintlify's base-tier bump behavior — see
 * `scripts-v2/runs/mintlify/migrate-tiers/`.
 *
 * Customers on the OLD base tier pay $0/month for 5,000 credits. The NEW
 * ladder's own tier 1 is ALSO a real $0/month tier, for 10,000 credits (not a
 * zero-credit floor — that was an earlier mistranscription of the tier
 * table). Because both cost $0, `round_to_lowest_price` naturally lands a
 * base-tier customer on the new tier-1 (10,000 credits) — the exact bump
 * Kyle asked for, with NO separate migration or special-case rule required.
 * This test locks in that the general rule alone produces the correct
 * result, so a future edit to the tier table (or the resolver) can't
 * silently regress this cohort back down.
 */

import type { ApiCustomerV5, CreatePlanItemParamsV1 } from "@autumn/shared";
import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const OLD_BASE_TIER_CREDITS = 5000;

/** Old base tier: $0/month for up to 5,000 credits. */
const oldBaseTierItem = () =>
	items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: OLD_BASE_TIER_CREDITS, amount: 0, flat_amount: 0 },
			{ to: "inf", amount: 0, flat_amount: 145 },
		],
	});

/** New ladder's real tier 1: $0/month for 10,000 credits. */
const NEW_LADDER_ITEM: CreatePlanItemParamsV1 = {
	feature_id: TestFeature.Messages,
	reset: { interval: ResetInterval.Month },
	price: {
		billing_method: BillingMethod.Prepaid,
		tier_behavior: TierBehavior.VolumeBased,
		interval: BillingInterval.Month,
		billing_units: 1,
		tiers: [
			{ to: 10_000, amount: 0, flat_amount: 0 },
			{ to: "inf", amount: 0, flat_amount: 145 },
		],
	},
};

test.concurrent(
	`${chalk.yellowBright("migrations base-tier bump: round_to_lowest_price alone bumps a $0 base-tier customer to 10,000 credits")}`,
	async () => {
		const customerId = "migration-base-tier-bump-general-rule";
		const pro = products.pro({ items: [oldBaseTierItem()] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: OLD_BASE_TIER_CREDITS },
					],
				}),
			],
		});

		// Old amount at 5,000 credits is $0 — the highest new tier with
		// flat_amount <= $0 is tier 1 itself (10,000 credits, $0), so the
		// general rule alone produces exactly Kyle's promotional bump.
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
							add_items: [NEW_LADDER_ITEM],
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
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 10_000,
			remaining: 10_000,
			usage: 0,
			planId: pro.id,
		});
	},
);
