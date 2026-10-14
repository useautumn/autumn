import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("multi-attach same add-on: 2x same tiered prepaid add-on with distinct quantities")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });

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
		customerId: "ma-same-addon-basic",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [s.billing.attach({ productId: mainPlan.id })],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			},
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 500 },
				],
			},
		],
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toEqual(50);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 1200,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
