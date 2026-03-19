import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("temp: multi-attach checkout pro annual + prepaid messages")}`, async () => {
	const customerId = "temp-multi-attach-pro-annual-prepaid";
	const prepaidQuantity = 300;
	const prepaidQuantity2 = 600;

	const annualMessagesItem = items.monthlyWords({ includedUsage: 200 });
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const proAnnual = products.proAnnual({
		id: "temp-pro-annual",
		items: [annualMessagesItem],
	});

	const monthlyPrepaidMessages = products.base({
		id: "temp-monthly-prepaid-messages",
		isAddOn: true,
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [proAnnual, monthlyPrepaidMessages] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{ plan_id: proAnnual.id },
			{
				plan_id: monthlyPrepaidMessages.id,
				feature_quantities: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
					},
				],
			},
			{
				plan_id: monthlyPrepaidMessages.id,
				subscription_id: "temp-subscription-id-2",
				feature_quantities: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity2,
					},
				],
			},
		],
	};

	const result = await autumnV1.billing.multiAttach(multiAttachParams);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proAnnual.id, monthlyPrepaidMessages.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: prepaidQuantity,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 230,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
