import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV0Input } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach prepaid addon: attach tiered prepaid add-on twice")}`, async () => {
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
		customerId: "attach-prepaid-addon-twice",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [
			s.billing.attach({ productId: mainPlan.id }),
			s.billing.attach({
				productId: prepaidAddon.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	};

	const preview = await autumnV1.billing.previewAttach<AttachParamsV0Input>(attachParams);
	expect(preview.total).toEqual(20);

	await autumnV1.billing.attach<AttachParamsV0Input>(attachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 600,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 20,
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test.concurrent(`${chalk.yellowBright("attach prepaid addon: flat prepaid add-on twice")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	const prepaidAddon = products.base({
		id: "flat-addon",
		isAddOn: true,
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "attach-flat-addon-twice",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [
			s.billing.attach({ productId: mainPlan.id }),
			s.billing.attach({
				productId: prepaidAddon.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	};

	const preview = await autumnV1.billing.previewAttach<AttachParamsV0Input>(attachParams);
	expect(preview.total).toEqual(40);

	await autumnV1.billing.attach<AttachParamsV0Input>(attachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 700,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 40,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
