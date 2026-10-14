import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	type MultiAttachParamsV0Input,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("multi-attach same add-on customize: 2x same add-on with different custom prepaid prices")}`, async () => {
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

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "ma-same-addon-customize",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [s.billing.attach({ productId: mainPlan.id })],
	});

	const multiAttachParams: MultiAttachParamsV0Input = {
		customer_id: customerId,
		plans: [
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
				customize: {
					price: {
						amount: 15,
						interval: BillingInterval.Month,
					},
				},
			},
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 300 },
				],
				customize: {
					price: {
						amount: 25,
						interval: BillingInterval.Month,
					},
				},
			},
		],
	};

	const basePriceTotal = 25 + 15;
	const prepaidPriceTotal = 1 * 10 + 2 * 10;
	const expectedTotal = basePriceTotal + prepaidPriceTotal;
	const preview = await autumnV2.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeGreaterThanOrEqual(expectedTotal - 0.01);
	expect(preview.total).toBeLessThanOrEqual(expectedTotal + 0.01);

	await autumnV2.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 1000,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
