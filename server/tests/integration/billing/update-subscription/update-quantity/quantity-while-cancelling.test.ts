import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("quantity-while-cancelling: active canceling product")}`, async () => {
	const customerId = "qty-cancel-active";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const prepaid = constructRawProduct({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaid] }),
		],
		actions: [
			s.billing.attach({
				productId: prepaid.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
			s.cancel({ productId: prepaid.id }),
		],
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: prepaid.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: prepaid.id,
	});

	expect(customerAfterUpdate.features?.[TestFeature.Messages]?.balance).toBe(
		200,
	);

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { shouldBeCanceling: true },
	});
});

test.concurrent(`${chalk.yellowBright("quantity-while-cancelling: scheduled product")}`, async () => {
	const customerId = "qty-cancel-sched";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const premium = constructProduct({
		id: "premium",
		items: [prepaidItem],
		type: "premium",
		isDefault: false,
	});

	const prepaid = constructRawProduct({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, prepaid] }),
		],
		actions: [
			s.attach({
				productId: premium.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits }],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: prepaid.id,
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: prepaid.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
				],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("quantity-while-cancelling: preserves usage")}`, async () => {
	const customerId = "qty-cancel-usage";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const prepaid = constructRawProduct({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaid] }),
		],
		actions: [
			s.billing.attach({
				productId: prepaid.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.balance).toBe(70);

	await autumnV1.cancel({
		customer_id: customerId,
		product_id: prepaid.id,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: prepaid.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: prepaid.id,
	});

	expect(customerAfterUpdate.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	expect(customerAfterUpdate.features?.[TestFeature.Messages]?.balance).toBe(
		170,
	);

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { shouldBeCanceling: true },
	});
});
