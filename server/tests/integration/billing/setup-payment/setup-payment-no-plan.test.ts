import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeSetupPaymentFormV2 as completeSetupPaymentForm } from "@tests/utils/browserPool/completeSetupPaymentFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("setup-payment: basic setup saves payment method")}`, async () => {
	const customerId = "setup-pay-no-plan-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
	});

	expect(res.customer_id).toBe(customerId);
	expect(res.url).toBeDefined();
	expect(res.url).toContain("checkout.stripe.com");

	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(attachResult.payment_url).toBeNull();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
