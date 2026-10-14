import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingVersion,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusService } from "@/internal/customers/CusService";

const getStripePrepaidSubscriptionItem = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;
	expect(stripeCustomerId).toBeDefined();

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});

	expect(subscriptions.data.length).toBeGreaterThan(0);
	const subscription = subscriptions.data[0];

	const prepaidItem = subscription.items.data.find((item) => {
		const hasQuantityGreaterThanOne =
			item.quantity !== undefined && item.quantity > 1;
		const hasTransformQuantity =
			(item as { transform_quantity?: unknown }).transform_quantity !==
			undefined;
		return hasQuantityGreaterThanOne || hasTransformQuantity;
	});

	return { stripeCli, subscription, prepaidItem, stripeCustomerId };
};

test.concurrent(`${chalk.yellowBright("v2→v1 compat: increment quantity (multi billing units)")}`, async () => {
	const customerId = "v2-v1-compat-incr-multi";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const initialTotalUnits = 500;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	const { prepaidItem: itemBefore } = await getStripePrepaidSubscriptionItem({
		customerId,
	});
	expect(itemBefore).toBeDefined();
	expect(itemBefore!.quantity).toBe(5);

	const updatedTotalUnits = 800;
	const updatedPacks = (updatedTotalUnits - includedUsage) / billingUnits;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: updatedPacks * billingUnits,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: updatedTotalUnits,
		balance: updatedTotalUnits,
		usage: 0,
	});

	const { prepaidItem: itemAfter } = await getStripePrepaidSubscriptionItem({
		customerId,
	});
	expect(itemAfter).toBeDefined();
	expect(itemAfter!.quantity).toBe(updatedPacks);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 3 * pricePerPack,
	});
});

test.concurrent(`${chalk.yellowBright("v2→v1 compat: decrement quantity (multi billing units)")}`, async () => {
	const customerId = "v2-v1-compat-decr-multi";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const initialTotalUnits = 800;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	const messagesUsed = 150;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	const { prepaidItem: itemBefore } = await getStripePrepaidSubscriptionItem({
		customerId,
	});
	expect(itemBefore).toBeDefined();
	expect(itemBefore!.quantity).toBe(8);

	const downgradedTotalUnits = 400;
	const downgradedPacks = (downgradedTotalUnits - includedUsage) / billingUnits;
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradedPacks * billingUnits,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: downgradedTotalUnits,
		balance: downgradedTotalUnits - messagesUsed,
		usage: messagesUsed,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: -4 * pricePerPack,
	});
});

test.concurrent(`${chalk.yellowBright("v2→v1 compat: decrement with no prorations")}`, async () => {
	const customerId = "v2-v1-compat-decr-no-prorate";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const initialTotalUnits = 600;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits;

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: (priceItem.price ?? 0) + initialPacks * pricePerPack,
	});

	const downgradedTotalUnits = 300;
	const downgradedPacks = (downgradedTotalUnits - includedUsage) / billingUnits;
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradedPacks * billingUnits,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: downgradedPacks * pricePerPack + (priceItem.price ?? 0),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});
});
