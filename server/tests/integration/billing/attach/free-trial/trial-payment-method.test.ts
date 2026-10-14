import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("trial-payment 3: card not required - no payment method")}`, async () => {
	const customerId = "trial-payment-no-card-req";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrialNoCard = products.proWithTrial({
		id: "pro-trial-nocard",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [proTrialNoCard] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrialNoCard.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrialNoCard.id,
		redirect_mode: "if_required",
	});

	expect(result.checkout_url).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proTrialNoCard.id,
	});

	await expectProductTrialing({
		customer,
		productId: proTrialNoCard.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	await expectCustomerInvoiceCorrect({ customer, count: 0 });
	await expectSubCount({ ctx, customerId, count: 0 });
});
