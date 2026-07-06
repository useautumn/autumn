/**
 * TDD coverage for patch-style item replacement rollover carry.
 *
 * Contract under test:
 *   New behaviors:
 *     - remove_items + add_items carries active rollovers from the deleted
 *       customer entitlement into the newly added matching entitlement.
 *     - A 50% max_percentage rollover on prepaid + consumable messages survives
 *       a prepaid item patch without replacing the customer product.
 *     - A volume-tiered (flat_amount bracket) prepaid item — the shape used by
 *       credit-ladder migrations like mintlify/migrate-tiers — also carries
 *       rollover, as long as the new item declares a matching `rollover` config.
 *   Side effects:
 *     - Existing-mode patch updates do not expire or replace the customer product.
 *     - Stripe subscription state stays consistent with the patched customer product.
 *
 * Pre-impl red: patch init may initialize the added customer entitlement without
 * the rollovers attached to the deleted entitlement.
 * Post-impl green: patch init scopes rollover carry to deleted patch items and
 * applies it to the corresponding inserted customer entitlement.
 *
 * The volume-tier case documents a real production bug: mintlify/migrate-tiers'
 * `buildAiCreditsItem()` omitted `rollover` on its `add_items` payload, so this
 * carry mechanism correctly (by design) treated the new item as non-rollover
 * -eligible and dropped the customer's accumulated balance. Confirmed red with
 * `rollover` stripped from `add_items` (remaining fell from 2250 to 1500 — the
 * rollover vanished); green once `rollover` is included, matching the fix in
 * `buildAiCreditsItem()`.
 */

import { test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

const monthlyRolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const apiMonthlyRolloverConfig = {
	max: 500,
	expiry_duration_type: RolloverExpiryDurationType.Month,
	expiry_duration_length: 1,
};

const maxPercentageRolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const apiMaxPercentageRolloverConfig = {
	max_percentage: 50,
	expiry_duration_type: RolloverExpiryDurationType.Month,
	expiry_duration_length: 1,
};

test.concurrent(
	`${chalk.yellowBright("patch update items carry rollover: metered rollover carries to added item")}`,
	async () => {
		const customerId = "patch-items-carry-rollover-metered";
		const base = products.base({
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: 400,
					rolloverConfig: monthlyRolloverConfig,
				}),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
				s.resetFeature({ featureId: TestFeature.Messages }),
			],
		});

		const customerAfterInvoice =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: customerAfterInvoice,
			featureId: TestFeature.Messages,
			remaining: 550,
			usage: 0,
			rollovers: [{ balance: 150 }],
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: base.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						interval: BillingInterval.Month,
					},
				],
				add_items: [
					{
						feature_id: TestFeature.Messages,
						included: 500,
						reset: { interval: ResetInterval.Month },
						rollover: apiMonthlyRolloverConfig,
					},
				],
			},
		};

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const customerAfterPatch =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPatch,
			active: [base.id],
		});
		expectBalanceCorrect({
			customer: customerAfterPatch,
			featureId: TestFeature.Messages,
			remaining: 650,
			usage: 0,
			rollovers: [{ balance: 150 }],
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: base.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("patch update items carry rollover: prepaid and consumable 50 percent rollover survives")}`,
	async () => {
		const customerId = "patch-items-carry-rollover-prepaid-consumable";
		const quantity = 1500;
		const expectedRollover = quantity / 2;
		const expectedRemaining = quantity + expectedRollover;

		const prepaidMessagesItem = constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			billingUnits: 1,
			price: 0.25,
			rolloverConfig: maxPercentageRolloverConfig,
		});

		const pro = products.pro({
			items: [prepaidMessagesItem, items.consumableMessages({ price: 0.1 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity }],
				}),
				s.advanceToNextInvoice(),
			],
		});

		const customerAfterInvoice =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: customerAfterInvoice,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
			usage: 0,
			rollovers: [{ balance: expectedRollover }],
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
					},
				],
				add_items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						price: {
							amount: 0.5,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.Prepaid,
							billing_units: 1,
						},
						rollover: apiMaxPercentageRolloverConfig,
					},
				],
			},
		};

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const customerAfterPatch =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPatch,
			active: [pro.id],
		});
		expectBalanceCorrect({
			customer: customerAfterPatch,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
			usage: 0,
			rollovers: [{ balance: expectedRollover }],
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("patch update items carry rollover: volume-tiered prepaid item (credit-ladder style) carries rollover")}`,
	async () => {
		const customerId = "patch-items-carry-rollover-volume-tier";
		const quantity = 1500;
		const expectedRollover = quantity / 2;
		const expectedRemaining = quantity + expectedRollover;

		const volumeTierCreditsItem = constructPrepaidItem({
			featureId: TestFeature.Messages,
			tierBehaviour: TierBehavior.VolumeBased,
			tiers: [
				{ to: 1000, amount: 0, flat_amount: 50 },
				{ to: "inf", amount: 0, flat_amount: 100 },
			],
			billingUnits: 1,
			includedUsage: 100,
			rolloverConfig: maxPercentageRolloverConfig,
		});

		const pro = products.pro({ items: [volumeTierCreditsItem] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity }],
				}),
				s.advanceToNextInvoice(),
			],
		});

		const customerAfterInvoice =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: customerAfterInvoice,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
			usage: 0,
			rollovers: [{ balance: expectedRollover }],
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
					},
				],
				add_items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						price: {
							billing_method: BillingMethod.Prepaid,
							tier_behavior: TierBehavior.VolumeBased,
							interval: BillingInterval.Month,
							billing_units: 1,
							tiers: [
								{ to: 2000, flat_amount: 80 },
								{ to: "inf", flat_amount: 150 },
							],
						},
						rollover: apiMaxPercentageRolloverConfig,
					},
				],
			},
		};

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const customerAfterPatch =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPatch,
			active: [pro.id],
		});
		expectBalanceCorrect({
			customer: customerAfterPatch,
			featureId: TestFeature.Messages,
			remaining: expectedRemaining,
			usage: 0,
			rollovers: [{ balance: expectedRollover }],
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
