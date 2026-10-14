import { test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 1: prepaid seats Pro → Premium → Pro Annual")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-1";

	const proUsers = items.prepaidUsers({ includedUsage: 0, billingUnits: 1 });
	const premiumUsers = items.prepaidUsers({
		includedUsage: 0,
		billingUnits: 1,
	});
	const proAnnualUsers = items.prepaidUsers({
		includedUsage: 0,
		billingUnits: 1,
	});

	const pro = products.pro({ id: "pro", items: [proUsers] });
	const premium = products.premium({ id: "premium", items: [premiumUsers] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium, proAnnual] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Users, quantity: 4 }],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Users,
		includedUsage: 4,
		balance: 4,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 60,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Users, quantity: 6 }],
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Users,
		includedUsage: 6,
		balance: 6,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		options: [{ feature_id: TestFeature.Users, quantity: 3 }],
	});

	const customerAfterProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterProAnnual,
		active: [proAnnual.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterProAnnual,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterProAnnual,
		count: 3,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 2: prepaid messages Pro → Premium")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-2";

	const proMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
	});
	const premiumMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
	});

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 50,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBeforeUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBeforeUpgrade,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 200,
		usage: 100,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 600 }],
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 3: pro → premium with explicit options (quantity excludes allowance)")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-3";
	const billingUnits = 100;

	const proIncludedUsage = 100;
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage: proIncludedUsage,
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

	const initialPacks = 3;
	const initialQuantityV1 = initialPacks * billingUnits;
	const initialTotalBalance = proIncludedUsage + initialQuantityV1;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});

	const upgradePacks = 5;
	const upgradeQuantityV1 = upgradePacks * billingUnits;
	const premiumTotalBalance = premiumIncludedUsage + upgradeQuantityV1;
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: upgradeQuantityV1,
			},
		],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalBalance,
		balance: premiumTotalBalance,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal:
			(premiumPriceItem.price ?? 0) -
			(proPriceItem.price ?? 0) +
			(upgradePacks * premiumPricePerPack - initialPacks * proPricePerPack),
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-prepaid 4: pro → premium without options (quantity inherits)")}`, async () => {
	const customerId = "legacy-upgrade-prepaid-4";
	const billingUnits = 100;

	const proIncludedUsage = 100;
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage: proIncludedUsage,
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

	const initialPacks = 4;
	const initialQuantityV1 = initialPacks * billingUnits;
	const initialTotalBalance = proIncludedUsage + initialQuantityV1;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const premiumTotalBalance = premiumIncludedUsage + initialQuantityV1;

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: premiumTotalBalance,
		balance: premiumTotalBalance,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal:
			(premiumPriceItem.price ?? 0) -
			(proPriceItem.price ?? 0) +
			initialPacks * (premiumPricePerPack - proPricePerPack),
	});
});
