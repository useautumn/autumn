import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-advanced 2: mixed product downgrade, no options")}`, async () => {
	const customerId = "sched-switch-prepaid-adv-2";

	const premiumOneOff = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumOneOff],
	});

	const proOneOff = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proOneOff],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
		],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
	});

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		notPresent: [premium.id],
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
