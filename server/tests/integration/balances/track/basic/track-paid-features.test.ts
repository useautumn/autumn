import { expect, test } from "bun:test";

import {
	type ApiCustomer,
	type ApiCustomerV3,
	ErrCode,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// TRACK-PAID1: Prepaid tracking (no overage allowed)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-paid1: prepaid tracking with no overage allowed")}`, async () => {
	const prepaidItem = items.prepaidMessages({
		includedUsage: 2,
		billingUnits: 1,
		price: 1,
	});

	const prepaidProduct = products.pro({
		id: "prepaid",
		items: [prepaidItem],
	});

	const prepaidQuantity = 3;

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-paid1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [prepaidProduct] }),
		],
		actions: [
			s.attach({
				productId: prepaidProduct.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
					},
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(5);

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () => {
			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 7,
				overage_behavior: "reject",
			});
		},
	});

	const customerAfterReject =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterReject.features[TestFeature.Messages].balance).toEqual(5);

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 4,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 2,
		purchased_balance: 3,
		current_balance: 1,
		usage: 4,
	});

	await timeout(2000);

	const customerNonCached = (await autumnV2.customers.get(customerId, {
		skip_cache: "true",
	})) as unknown as ApiCustomer;
	const feature = customerNonCached.balances[TestFeature.Messages];

	expect(feature).toMatchObject({
		granted_balance: 2,
		purchased_balance: 3,
		current_balance: 1,
		usage: 4,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-PAID2: Pay-per-use/arrear tracking (overage allowed with usage limit)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-paid2: pay-per-use tracking with overage allowed and usage limit")}`, async () => {
	const payPerUseItem = items.consumableMessages({
		includedUsage: 5,
		maxPurchase: 5,
		price: 0.01,
	});

	const payPerUseProduct = products.pro({
		id: "payperuse",
		items: [payPerUseItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-paid2",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [payPerUseProduct] }),
		],
		actions: [s.attach({ productId: payPerUseProduct.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(5);

	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 7,
		overage_behavior: "reject",
	});

	expect(trackRes1.balance).toMatchObject({
		granted_balance: 5,
		purchased_balance: 2,
		current_balance: 0,
		usage: 7,
	});

	const customerAfter7 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter7.features[TestFeature.Messages].balance).toEqual(-2);
	expect(customerAfter7.features[TestFeature.Messages].usage).toEqual(7);

	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 3,
		overage_behavior: "reject",
	});

	expect(trackRes2.balance).toMatchObject({
		granted_balance: 5,
		purchased_balance: 5,
		current_balance: 0,
		usage: 10,
	});

	const customerAfter10 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter10.features[TestFeature.Messages].balance).toEqual(-5);
	expect(customerAfter10.features[TestFeature.Messages].usage).toEqual(10);

	await timeout(5000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Messages].balance).toEqual(-5);
	expect(customerNonCached.features[TestFeature.Messages].usage).toEqual(10);
});
