import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	UpdateSubscriptionPreviewIntent,
} from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewChanges } from "@tests/integration/billing/utils/expectPreviewChanges";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const getProducts = () => {
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });
	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	return {
		free,
		pro,
	};
};

test.concurrent(`${chalk.yellowBright("update-subscription preview: update quantity")}`, async () => {
	const customerId = "update-sub-preview-quantity";
	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { advancedTo, autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	expect(preview.intent).toBe(UpdateSubscriptionPreviewIntent.UpdateQuantity);

	expectPreviewChanges({
		preview,
		incoming: [
			{
				planId: pro.id,
				featureQuantities: [
					{ feature_id: TestFeature.Messages, quantity: 300 },
				],
				effectiveAt: null,
			},
		],
		outgoing: [
			{
				planId: pro.id,
				featureQuantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
				effectiveAt: advancedTo,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("update-subscription preview: update custom plan")}`, async () => {
	const customerId = "update-sub-preview-custom-plan";
	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const preview = await autumnV2_1.subscriptions.previewUpdate({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
			items: [itemsV2.monthlyWords({ included: 200 })],
		},
	});

	expect(preview.intent).toBe(UpdateSubscriptionPreviewIntent.UpdatePlan);
	expectPreviewChanges({
		preview,
		incoming: [{ planId: pro.id, effectiveAt: null }],
		outgoing: [{ planId: pro.id }],
	});
});

test.concurrent(`${chalk.yellowBright("update-subscription preview: cancel immediately with default free")}`, async () => {
	const customerId = "update-sub-preview-cancel-immediately";
	const { free, pro } = getProducts();

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBeforePreview =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBeforePreview,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: customerBeforePreview,
		productId: free.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	expect(preview.total).toBe(-20);
	expectPreviewChanges({
		preview,
		incoming: [{ planId: free.id, effectiveAt: null }],
		outgoing: [{ planId: pro.id }],
	});
});

test.concurrent(`${chalk.yellowBright("update-subscription preview: cancel end of cycle with default free")}`, async () => {
	const customerId = "update-sub-preview-cancel-eoc";
	const { free, pro } = getProducts();

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBeforePreview =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBeforePreview,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: customerBeforePreview,
		productId: free.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	expectPreviewChanges({
		preview,
		incoming: [{ planId: free.id, effectiveAt: null }],
		outgoing: [{ planId: pro.id }],
	});
});

test.concurrent(`${chalk.yellowBright("update-subscription preview: uncancel with scheduled default free")}`, async () => {
	const customerId = "update-sub-preview-uncancel";
	const { free, pro } = getProducts();

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const customerBeforePreview =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerBeforePreview,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerBeforePreview,
		productId: free.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	expectPreviewChanges({
		preview,
		incoming: [{ planId: pro.id, effectiveAt: null }],
		outgoing: [{ planId: pro.id }],
	});
});
