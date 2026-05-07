/**
 * TDD coverage for patch-style paid feature item updates.
 *
 * Contract under test:
 *   New behaviors:
 *     - remove_items + add_items can replace a free metered item with prepaid
 *       messages, preserve existing usage, and bill the prepaid quantity.
 *     - remove_items + add_items can replace a free metered item with consumable
 *       messages, preserve existing usage, and avoid immediate overage billing.
 *     - Entity-scoped paid feature patches only affect the targeted entity.
 *   Side effects:
 *     - Preview total matches the invoice total when a paid patch bills now.
 *     - Existing-mode patch updates do not expire or replace the customer product.
 *     - Stripe subscription state stays consistent with the patched customer product.
 *
 * Pre-impl red: patch setup/compute may miss paid feature prices when add_items
 * contains prepaid or consumable items, or may lose carried usage.
 * Post-impl green: paid feature patch rows are initialized, invoiced, and applied
 * through patchCustomerProducts while preserving usage.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV2,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { setupUpdateSubscriptionBillingContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionBillingContext";

test.concurrent(`${chalk.yellowBright("patch paid features: free messages to prepaid with usage carry")}`, async () => {
	const customerId = "patch-paid-features-to-prepaid";
	const messagesUsage = 60;
	const quantity = 300;
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				itemsV2.dashboard(),
				itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 }),
			],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(30);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: quantity - messagesUsage,
		usage: messagesUsage,
		planId: pro.id,
		breakdown: {
			[BillingMethod.Prepaid]: {
				prepaid_grant: quantity,
				remaining: quantity - messagesUsage,
				usage: messagesUsage,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: preview.total,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch paid features: free messages to consumable with usage carry")}`, async () => {
	const customerId = "patch-paid-features-to-consumable";
	const messagesUsage = 60;
	const included = 50;
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				itemsV2.dashboard(),
				{
					...itemsV2.consumableMessages({ amount: 0.1 }),
					included,
				},
			],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(0);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: messagesUsage,
		planId: pro.id,
		breakdown: {
			[BillingMethod.UsageBased]: {
				included_grant: included,
				remaining: 0,
				usage: messagesUsage,
			},
		},
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch paid features: entity prepaid patch only affects target entity")}`, async () => {
	const customerId = "patch-paid-features-entity";
	const messagesUsage = 40;
	const quantity = 300;
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
		customize: {
			remove_items: [
				{
					feature_id: TestFeature.Messages,
					interval: BillingInterval.Month,
				},
			],
			add_items: [
				itemsV2.dashboard(),
				itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 }),
			],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(30);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);

	expectFlagCorrect({
		customer: entity1,
		featureId: TestFeature.Dashboard,
		present: false,
	});
	expectBalanceCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});
	expectFlagCorrect({
		customer: entity2,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		remaining: quantity - messagesUsage,
		usage: messagesUsage,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 3,
		latestTotal: preview.total,
	});
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: pro.id,
		entityId: entities[1].id,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch paid features: consumable to prepaid optionally charges existing overage")}`, async () => {
	const customerId = "patch-paid-features-charge-existing-overage";
	const messagesUsage = 80;
	const quantity = 300;
	const pro = products.pro({
		items: [items.consumableMessages({ includedUsage: 50, price: 0.1 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
		customize: {
			remove_items: [
				{
					feature_id: TestFeature.Messages,
					billing_method: BillingMethod.UsageBased,
				},
			],
			add_items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 })],
		},
	};
	const internalUpdateParams = updateParams as Parameters<
		typeof setupUpdateSubscriptionBillingContext
	>[0]["params"];

	const defaultBillingContext = await setupUpdateSubscriptionBillingContext({
		ctx,
		params: internalUpdateParams,
	});
	const defaultPlan = await computeUpdateSubscriptionPlan({
		ctx,
		billingContext: defaultBillingContext,
		params: internalUpdateParams,
	});
	const defaultTotal = defaultPlan.lineItems?.reduce(
		(total, lineItem) => total + lineItem.amount,
		0,
	);
	expect(defaultTotal).toBe(30);
	expect(
		defaultPlan.patchCustomerProducts?.[0]?.insertCustomerEntitlements[0]
			?.balance,
	).toBe(quantity - messagesUsage);

	const chargeExistingBillingContext =
		await setupUpdateSubscriptionBillingContext({
			ctx,
			params: internalUpdateParams,
			contextOverride: {
				chargeExistingOverages: true,
				skipExistingUsageCarry: true,
			},
		});
	const chargeExistingPlan = await computeUpdateSubscriptionPlan({
		ctx,
		billingContext: chargeExistingBillingContext,
		params: internalUpdateParams,
	});
	const chargeExistingTotal = chargeExistingPlan.lineItems?.reduce(
		(total, lineItem) => total + lineItem.amount,
		0,
	);
	expect(chargeExistingTotal).toBe(33);
	expect(
		chargeExistingPlan.patchCustomerProducts?.[0]?.insertCustomerEntitlements[0]
			?.balance,
	).toBe(quantity);
});
