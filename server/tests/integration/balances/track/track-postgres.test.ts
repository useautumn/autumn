import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("track-postgres1: customer-level overage stays cumulative across entities when Postgres handles follow-up tracks")}`, async () => {
	const customerProduct = products.base({
		id: "track-postgres-customer-across-entities",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				maxPurchase: 25,
				price: 0.5,
			}),
		],
	});

	const { autumnV2, autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-postgres-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [customerProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: customerProduct.id })],
	});

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 120,
		},
		{ skipCache: true },
	);

	await timeout(4000);

	await autumnV2.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 10,
		},
		{ skipCache: true },
	);

	const cachedCustomer =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: cachedCustomer,
		featureId: TestFeature.Messages,
		remaining: 0,
		breakdown: {
			month: {
				included_grant: 100,
				remaining: 0,
				usage: 125,
			},
		},
	});

	const uncachedCustomer = await autumnV2_1.customers.get<ApiCustomerV5>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expectBalanceCorrect({
		customer: uncachedCustomer,
		featureId: TestFeature.Messages,
		remaining: 0,
		breakdown: {
			month: {
				included_grant: 100,
				remaining: 0,
				usage: 125,
			},
		},
	});

	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () =>
			await autumnV2.track(
				{
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				},
				{ skipCache: true },
			),
	});
});
