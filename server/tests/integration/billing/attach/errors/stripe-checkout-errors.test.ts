import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

test.concurrent(`${chalk.yellowBright("error: multi-interval checkout not supported")}`, async () => {
	const customerId = "stripe-checkout-error-multi-interval";

	const monthlyPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const annualPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 50,
		intervalCount: 12,
	});

	const mixedIntervalProduct = products.base({
		id: "mixed-interval",
		items: [monthlyPrepaidItem, annualPrepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [mixedIntervalProduct] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: mixedIntervalProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: multi-interval checkout with allocated users")}`, async () => {
	const customerId = "stripe-checkout-error-multi-allocated";
	const userCount = 5;

	const allocatedUsersItem = items.allocatedUsers({
		includedUsage: 0,
	});

	const annualPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 50,
		intervalCount: 12,
	});

	const mixedIntervalProduct = products.base({
		id: "mixed-interval-allocated",
		items: [allocatedUsersItem, annualPrepaidItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [mixedIntervalProduct] }),
			s.entities({ count: userCount, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	expect(entities.length).toBe(userCount);

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: mixedIntervalProduct.id,
				options: [{ feature_id: TestFeature.Words, quantity: 100 }],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: zero price checkout (allocated, no usage)")}`, async () => {
	const customerId = "stripe-checkout-error-zero-allocated";

	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });

	const base = products.base({
		id: "zero-allocated",
		items: [allocatedUsersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: base.id,
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: zero price checkout (prepaid, quantity 0)")}`, async () => {
	const customerId = "stripe-checkout-error-zero-prepaid";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const base = products.base({
		id: "zero-prepaid",
		items: [prepaidMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: base.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
			});
		},
	});
});
