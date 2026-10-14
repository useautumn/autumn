import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("trial-qty: update prepaid quantity while trialing")}`, async () => {
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });

	const proTrial = products.proWithTrial({
		items: [prepaidItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-qty-prepaid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({
				productId: proTrial.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	expect(customer.features[TestFeature.Messages].balance).toEqual(200);

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { status: "trialing" },
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});
