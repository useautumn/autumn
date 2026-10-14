import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth")}`, async () => {
	const customerId = "legacy-upgrade-usage-1";

	const proWords = items.consumableWords({ includedUsage: 100 });
	const premiumWords = items.consumableWords({ includedUsage: 100 });
	const growthWords = items.consumableWords({ includedUsage: 100 });

	const pro = products.pro({ id: "pro", items: [proWords] });
	const premium = products.premium({ id: "premium", items: [premiumWords] });
	const growth = products.growth({ id: "growth", items: [growthWords] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium, growth] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 200,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBeforePremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -100,
		usage: 200,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 35,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 300,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBeforeGrowth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -200,
		usage: 300,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: growth.id,
	});

	const customerAfterGrowth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterGrowth,
		active: [growth.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterGrowth,
		count: 3,
		latestTotal: 60,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-usage 2: monthly → annual interval change")}`, async () => {
	const customerId = "legacy-upgrade-usage-2";

	const proMonthlyWords = items.consumableWords({ includedUsage: 100 });
	const proAnnualWords = items.consumableWords({ includedUsage: 100 });
	const premiumAnnualWords = items.consumableWords({ includedUsage: 100 });

	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [proMonthlyWords],
	});
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualWords],
	});
	const premiumAnnual = constructProduct({
		id: "premium-annual",
		items: [premiumAnnualWords],
		type: "premium",
		isAnnual: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proMonthly, proAnnual, premiumAnnual] }),
		],
		actions: [s.attach({ productId: proMonthly.id })],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [proMonthly.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 150,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBeforeProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -50,
		usage: 150,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	const customerAfterProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterProAnnual,
		active: [proAnnual.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterProAnnual,
		count: 2,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 200,
	});

	await new Promise((r) => setTimeout(r, 2000));

	const customerBeforePremiumAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -100,
		usage: 200,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumAnnual.id,
	});

	const customerAfterPremiumAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremiumAnnual,
		active: [premiumAnnual.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremiumAnnual,
		count: 3,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-usage 3: arrear prorated seats with entities")}`, async () => {
	const customerId = "legacy-upgrade-usage-3";

	const proUsers = items.allocatedUsers({ includedUsage: 0 });
	const premiumUsers = items.allocatedUsers({ includedUsage: 0 });
	const proAnnualUsers = items.allocatedUsers({ includedUsage: 0 });

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
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 2,
		balance: -2,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 40,
	});

	await autumnV1.entities.create(customerId, [
		{ id: "ent-3", name: "Entity 3", feature_id: TestFeature.Users },
	]);

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		count: 2,
		latestTotal: 10,
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 3,
		balance: -3,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 3,
		balance: -3,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 3,
		latestTotal: 30,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	const customerAfterProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterProAnnual,
		active: [proAnnual.id],
	});

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 3,
		balance: -3,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterProAnnual,
		count: 4,
		latestTotal: 150,
	});
});
