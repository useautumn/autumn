import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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

test.concurrent(`${chalk.yellowBright("attach-line-items 1: attach pro with all feature types")}`, async () => {
	const customerId = "attach-li-all-features";

	const freeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const messagesQuantity = 500;
	const messagesPrice = 10 * 4;
	const allocatedUsersPrice = 10 * 2;
	const basePrice = 20;
	const expectedTotal = basePrice + messagesPrice + allocatedUsersPrice;

	const pro = products.pro({
		id: "pro-all-features",
		items: [freeMessages, prepaidMessages, consumableWords, allocatedUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity + 100,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 50,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
			{ featureId: TestFeature.Users, totalAmount: allocatedUsersPrice },
		],
	});
});

test.concurrent(`${chalk.yellowBright("attach-line-items 2: pro to premium upgrade with all feature types")}`, async () => {
	const customerId = "attach-li-upgrade";

	const proFreeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const proPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proConsumableWords = items.consumableWords({ includedUsage: 50 });
	const proAllocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-all-features",
		items: [
			proFreeMessages,
			proPrepaidMessages,
			proConsumableWords,
			proAllocatedUsers,
		],
	});

	const premiumFreeMessages = items.lifetimeMessages({ includedUsage: 200 });
	const premiumPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premiumConsumableWords = items.consumableWords({ includedUsage: 100 });
	const premiumAllocatedUsers = items.allocatedUsers({ includedUsage: 5 });

	const premium = products.premium({
		id: "premium-all-features",
		items: [
			premiumFreeMessages,
			premiumPrepaidMessages,
			premiumConsumableWords,
			premiumAllocatedUsers,
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 5000 }),
		],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedCount: 6,
		expectedLineItems: [
			{
				isBasePrice: true,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
			},
			{ featureId: TestFeature.Messages, direction: "refund", minCount: 1 },
			{ featureId: TestFeature.Users, direction: "refund", minCount: 1 },

			{
				isBasePrice: true,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
			},
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				billingTiming: "in_advance",
				minCount: 1,
			},

			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				totalAmount: 2.5,
				count: 1,
			},
		],
	});
});
