/**
 * TDD coverage for `feature_quantities_strategy`/`proration` against realistic
 * Mintlify customer topologies (grounded in a real prod-shape survey, not
 * imagined cases): active+scheduled pairs sharing one subscription,
 * multi-entity customers with independent per-entity quantities, add-ons
 * attached alongside a main plan, and custom/negotiated cusProducts.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, CreatePlanItemParamsV1 } from "@autumn/shared";
import {
	BillingInterval,
	BillingMethod,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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
	`${chalk.yellowBright("migrations update_plan: active + scheduled pair on one subscription both migrate")}`,
	async () => {
		const customerId = "migration-fqs-scheduled";
		const premium = products.premium({ items: [oldVolumeItem()] });
		const pro = products.pro({ items: [oldVolumeItem()] });

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				// Attaching the lower plan on the same entity schedules a downgrade —
				// premium stays active this cycle, pro takes over next cycle.
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 700 }],
					timeout: 4000,
				}),
			],
		});

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

		// Premium (active) was at 300 -> $20 old tier -> new $10/200 tier.
		// Pro (scheduled) was at 700 -> $50 old tier -> new $40/1000 tier.
		const entity = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			remaining: 200,
			usage: 0,
			planId: premium.id,
		});

		// The whole schedule (both phases) must be restored to Stripe in one shot.
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: multi-entity customer resolves quantity independently per entity")}`,
	async () => {
		const customerId = "migration-fqs-multi-entity";
		const pro = products.pro({ items: [oldVolumeItem()] });

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 1,
					options: [{ feature_id: TestFeature.Messages, quantity: 700 }],
				}),
			],
		});

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

		const entity1 = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[0].id,
		);
		const entity2 = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[1].id,
		);

		// Entity 1: 300 -> $20 old tier -> new 200/$10 tier.
		expectBalanceCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			remaining: 200,
			usage: 0,
			planId: pro.id,
		});
		// Entity 2: 700 -> $50 old tier -> new 1000/$40 tier.
		expectBalanceCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			remaining: 1000,
			usage: 0,
			planId: pro.id,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: add-on alongside main plan is untouched")}`,
	async () => {
		const customerId = "migration-fqs-addon";
		const pro = products.pro({ items: [oldVolumeItem()] });
		const addon = products.recurringAddOn({ items: [] });

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.billing.attach({ productId: addon.id }),
			],
		});

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

		const entity = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			remaining: 200,
			usage: 0,
			planId: pro.id,
		});

		await expectCustomerProducts({ customerId, active: [pro.id, addon.id] });

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: is_custom cusProduct handled without error")}`,
	async () => {
		const customerId = "migration-fqs-custom-plan";
		const pro = products.pro({ items: [oldVolumeItem()] });

		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		// Custom/negotiated plan (is_custom: true) — direct client call with a
		// custom base price override, matching how attach/params/custom-plan
		// tests build one.
		await autumnV1.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			product_id: pro.id,
			items: [
				items.monthlyPrice({ price: 15 }),
				items.volumePrepaidMessages({
					includedUsage: 0,
					billingUnits: 1,
					tiers: [
						{ to: 500, amount: 0, flat_amount: 20 },
						{ to: "inf", amount: 0, flat_amount: 50 },
					],
				}),
			],
			options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			redirect_mode: "if_required",
		});

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

		const entity = await autumnV2_2.entities.get<ApiCustomerV5>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			remaining: 200,
			usage: 0,
			planId: pro.id,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
