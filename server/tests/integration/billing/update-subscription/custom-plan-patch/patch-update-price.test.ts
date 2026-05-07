/**
 * TDD coverage for patch-style custom plan price updates.
 *
 * Contract under test:
 *   New behaviors:
 *     - customize.price + add_items updates the base price and appends items in patch mode.
 *     - customize.price: null removes the base price in patch mode.
 *     - customize.price alone updates the base price while preserving feature items.
 *     - entity-scoped patch price updates only affect the target entity.
 *   Side effects:
 *     - Existing-mode patch updates do not expire or replace the customer product.
 *     - Stripe subscription state stays consistent with the patched customer product.
 *
 * Pre-impl red: patch setup ignores customize.price, so price-only patches are rejected
 * or produce no Stripe delta.
 * Post-impl green: patch setup deletes the old base customer price, inserts the custom
 * base price when provided, and patches the existing customer product.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("patch update price: update price and add boolean entitlement")}`, async () => {
	const customerId = "patch-update-price-add-item-tdd";
	const pro = products.pro({ items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 32 }),
			add_items: [itemsV2.dashboard()],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(12);

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
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch update price: remove price without replacing customer product")}`, async () => {
	const customerId = "patch-update-price-remove-tdd";
	const pro = products.pro({ items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: null,
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(-20);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("patch update price: update price only and preserve metered entitlement")}`, async () => {
	const customerId = "patch-update-price-only-tdd";
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 35 }),
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(15);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch update price: entity update only affects target entity")}`, async () => {
	const customerId = "patch-update-price-entity-tdd";
	const pro = products.pro({ items: [] });

	const { autumnV2_2, ctx, entities } = await initScenario({
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

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 29 }),
			add_items: [itemsV2.dashboard()],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(9);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

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
	expectFlagCorrect({
		customer: entity2,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: pro.id,
		entityId: entities[1].id,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
