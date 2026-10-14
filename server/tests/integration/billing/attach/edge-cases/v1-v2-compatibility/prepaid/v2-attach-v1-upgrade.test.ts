import { test } from "bun:test";
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

test.concurrent(`${chalk.yellowBright("v2→v1 upgrade: product upgrade (pro → premium) same quantity")}`, async () => {
	const customerId = "v2-v1-upgrade-product";
	const billingUnits = 100;
	const includedUsage = 100;

	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: proPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	const premiumIncludedUsage = 200;
	const premiumPricePerPack = 15;
	const premiumPrepaidItem = items.prepaidMessages({
		includedUsage: premiumIncludedUsage,
		billingUnits,
		price: premiumPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [premiumPrepaidItem, premiumPriceItem],
	});

	const initialTotalUnits = 500;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
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

	const premiumTotalUnits = premiumIncludedUsage + initialPacks * billingUnits;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialPacks * billingUnits,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalUnits,
		balance: premiumTotalUnits,
		usage: 0,
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
		latestTotal:
			initialPacks * (premiumPricePerPack - proPricePerPack) +
			(premiumPriceItem.price ?? 0) -
			(proPriceItem.price ?? 0),
	});
});

test.concurrent(`${chalk.yellowBright("v2→v1 upgrade: product upgrade with increased quantity")}`, async () => {
	const customerId = "v2-v1-upgrade-product-qty";
	const billingUnits = 100;
	const includedUsage = 100;

	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: proPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	const premiumIncludedUsage = 200;
	const premiumPricePerPack = 15;
	const premiumPrepaidItem = items.prepaidMessages({
		includedUsage: premiumIncludedUsage,
		billingUnits,
		price: premiumPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [premiumPrepaidItem, premiumPriceItem],
	});

	const initialTotalUnits = 300;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
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

	const upgradePacks = 5;
	const premiumTotalUnits = premiumIncludedUsage + upgradePacks * billingUnits;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: upgradePacks * billingUnits,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalUnits,
		balance: premiumTotalUnits,
		usage: 0,
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
	});
});

test.concurrent(`${chalk.yellowBright("v2→v1 upgrade: single billing unit (users)")}`, async () => {
	const customerId = "v2-v1-upgrade-users";
	const billingUnits = 1;
	const includedUsage = 0;
	const basicPricePerUnit = 5;
	const basicPrepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage,
		billingUnits,
		price: basicPricePerUnit,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const basicPriceItem = items.monthlyPrice({ price: 10 });
	const basic = products.base({
		id: "basic",
		items: [basicPrepaidItem, basicPriceItem],
	});

	const proIncludedUsage = 0;
	const proPricePerUnit = 8;
	const proPrepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage: proIncludedUsage,
		billingUnits,
		price: proPricePerUnit,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	const initialTotalUnits = 15;
	const initialPaidUnits = initialTotalUnits - includedUsage;

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [basic, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: basic.id,
				options: [
					{ feature_id: TestFeature.Users, quantity: initialTotalUnits },
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	const proTotalUnits = proIncludedUsage + initialPaidUnits;
	const pricePerPack = proPricePerUnit * billingUnits;

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Users,
				quantity: initialPaidUnits,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Users,
		includedUsage: proTotalUnits,
		balance: proTotalUnits,
		usage: 0,
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
		latestTotal:
			(proPriceItem.price ?? 0) -
			(basicPriceItem.price ?? 0) +
			(proPricePerUnit - basicPricePerUnit) * initialPaidUnits,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: initialPaidUnits * proPricePerUnit + (proPriceItem.price ?? 0),
	});
});
