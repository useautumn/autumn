import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("renewal-li 1: single product with all feature types + consumable overage")}`, async () => {
	const customerId = "renewal-li-all-features";

	const lifetimeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-all-features",
		items: [lifetimeMessages, prepaidMessages, consumableWords, allocatedUsers],
	});

	const basePrice = 20;
	const prepaidQuantity = 500;
	const prepaidPrice = 10 * 4;
	const allocatedPrice = 10 * 2;
	const wordsTracked = 200;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: prepaidQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Words,
				value: wordsTracked,
				timeout: 5000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const expectedWordsOverage = calculateExpectedInvoiceAmount({
		items: [consumableWords],
		usage: [{ featureId: TestFeature.Words, value: wordsTracked }],
		options: { includeFixed: false, onlyArrear: true },
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: prepaidPrice,
			},
			{
				featureId: TestFeature.Users,
				billingTiming: "in_advance",
				totalAmount: allocatedPrice,
			},
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				totalAmount: expectedWordsOverage,
			},
		],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
	});
});

test.concurrent(`${chalk.yellowBright("renewal-li 2: multi-product pro + recurring add-on")}`, async () => {
	const customerId = "renewal-li-multi-product";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidMessages],
	});

	const consumableWords = items.consumableWords({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon-consumable",
		items: [consumableWords],
	});

	const proBasePrice = 20;
	const addonBasePrice = 20;
	const prepaidQuantity = 300;
	const prepaidPrice = 10 * 2;
	const wordsTracked = 300;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: prepaidQuantity },
				],
			}),
			s.billing.attach({ productId: addon.id }),
			s.track({
				featureId: TestFeature.Words,
				value: wordsTracked,
				timeout: 5000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const expectedWordsOverage = calculateExpectedInvoiceAmount({
		items: [consumableWords],
		usage: [{ featureId: TestFeature.Words, value: wordsTracked }],
		options: { includeFixed: false, onlyArrear: true },
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: addon.id });

	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, productId: pro.id, amount: proBasePrice },
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: prepaidPrice,
				totalQuantity: prepaidQuantity,
				paidQuantity: prepaidQuantity,
			},
			{ isBasePrice: true, productId: addon.id, amount: addonBasePrice },
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				totalAmount: expectedWordsOverage,
				totalQuantity: wordsTracked,
				paidQuantity: wordsTracked - 100,
			},
		],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});
});

test.concurrent(`${chalk.yellowBright("renewal-li 3: pro on entities 1 and 2 (combined invoice)")}`, async () => {
	const customerId = "renewal-li-entity-products";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro-entity",
		items: [prepaidMessages],
	});

	const basePrice = 20;
	const entity1PrepaidQuantity = 200;
	const entity1PrepaidPrice = 10 * 1;
	const entity2PrepaidQuantity = 300;
	const entity2PrepaidPrice = 10 * 2;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity1PrepaidQuantity,
					},
				],
				timeout: 2000,
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity2PrepaidQuantity,
					},
				],
				timeout: 2000,
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	const expectedTotal =
		basePrice * 2 + entity1PrepaidPrice + entity2PrepaidPrice;

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, totalAmount: basePrice * 2 },
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: entity1PrepaidPrice + entity2PrepaidPrice,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("renewal-li 4: premium downgrade to pro - pro renewal line items")}`, async () => {
	const customerId = "renewal-li-downgrade";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium-prepaid",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [proPrepaid],
	});

	const proBasePrice = 20;
	const proQuantity = 200;
	const proPrepaidPrice = 10 * 1;

	const { autumnV1 } = await initScenario({
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
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
				timeout: 2000,
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	const expectedTotal = proBasePrice + proPrepaidPrice;

	const lineItems = await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, productId: pro.id, amount: proBasePrice },
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				productId: pro.id,
				totalAmount: proPrepaidPrice,
			},
		],
	});

	const premiumLineItems = lineItems.filter(
		(li) => li.product_id === premium.id,
	);
	expect(
		premiumLineItems.length,
		`Expected no Premium line items on Pro renewal, found ${premiumLineItems.length}`,
	).toBe(0);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: proQuantity,
	});
});
