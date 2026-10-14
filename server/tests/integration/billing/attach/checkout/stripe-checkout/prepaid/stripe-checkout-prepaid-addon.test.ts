import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	AttachParamsV0,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe checkout prepaid addon: checkout first, then direct attach second")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const prepaidAddon = products.base({
		id: "prepaid-addon",
		isAddOn: true,
		items: [
			items.tieredPrepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				tiers: [
					{ to: 500, amount: 10 },
					{ to: "inf", amount: 5 },
				],
			}),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "co-prepaid-addon-then-direct",
		setup: [s.customer({}), s.products({ list: [prepaidAddon] })],
		actions: [],
	});

	const checkoutResult = await autumnV1.billing.attach<AttachParamsV0>({
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "always",
	});

	expect(checkoutResult.payment_url).toBeDefined();
	expect(checkoutResult.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: checkoutResult.payment_url });

	const customerAfterFirst =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterFirst,
		active: [prepaidAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterFirst,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	const secondAttachParams: AttachParamsV0 = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		redirect_mode: "if_required",
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	};

	const preview =
		await autumnV1.billing.previewAttach<AttachParamsV0>(secondAttachParams);
	expect(preview.total).toEqual(20);

	await autumnV1.billing.attach<AttachParamsV0>(secondAttachParams);

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerFinal,
		active: [prepaidAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerFinal,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("stripe checkout prepaid addon: checkout then update quantity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	const prepaidAddon = products.base({
		id: "prepaid-addon",
		isAddOn: true,
		items: [
			items.tieredPrepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				tiers: [
					{ to: 500, amount: 10 },
					{ to: "inf", amount: 5 },
				],
			}),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "co-prepaid-addon-update-qty",
		setup: [s.customer({}), s.products({ list: [mainPlan, prepaidAddon] })],
		actions: [],
	});

	const checkoutResult = await autumnV1.billing.attach<AttachParamsV0>({
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "always",
	});

	expect(checkoutResult.payment_url).toBeDefined();
	await completeStripeCheckoutForm({ url: checkoutResult.payment_url });

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	const updateParams: UpdateSubscriptionV0Params = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	};

	const updatePreview =
		await autumnV1.subscriptions.previewUpdate<UpdateSubscriptionV0Params>(
			updateParams,
		);
	expect(updatePreview.total).toEqual(30);

	await autumnV1.subscriptions.update<UpdateSubscriptionV0Params>(updateParams);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
