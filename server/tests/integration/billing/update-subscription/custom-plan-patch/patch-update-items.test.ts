/**
 * TDD coverage for patch-style custom plan item updates.
 *
 * Red-failure mode (current behavior):
 *  - add_items/remove_items can build an incomplete patch plan or lose usage while replacing feature items.
 *
 * Green-success criteria (after fix):
 *  - Patch updates add/remove only the requested feature items, and existing usage carries into matching replacements.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
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

test.concurrent(`${chalk.yellowBright("patch update items: add boolean and metered entitlements")}`, async () => {
	const customerId = "patch-update-items-add";
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
			add_items: [itemsV2.dashboard(), itemsV2.monthlyWords({ included: 150 })],
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
		featureId: TestFeature.Words,
		remaining: 150,
		usage: 0,
		planId: pro.id,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch update items: remove boolean and metered entitlements")}`, async () => {
	const customerId = "patch-update-items-remove";
	const pro = products.pro({
		items: [items.dashboard(), items.monthlyWords({ includedUsage: 120 })],
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
			remove_items: [
				{ feature_id: TestFeature.Dashboard },
				{ feature_id: TestFeature.Words },
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
		present: false,
	});
	expect(customer.balances[TestFeature.Words]).toBeUndefined();
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch update items: replace included messages and preserve usage")}`, async () => {
	const customerId = "patch-update-items-replace-messages";
	const messagesUsage = 40;
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
			add_items: [itemsV2.monthlyMessages({ included: 250 })],
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
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 210,
		usage: messagesUsage,
		planId: pro.id,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch update items: entity update only affects target entity")}`, async () => {
	const customerId = "patch-update-items-entity";
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
			add_items: [itemsV2.dashboard(), itemsV2.monthlyWords({ included: 75 })],
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
	expect(entity1.balances[TestFeature.Words]).toBeUndefined();
	expectFlagCorrect({
		customer: entity2,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity2,
		featureId: TestFeature.Words,
		remaining: 75,
		usage: 0,
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
