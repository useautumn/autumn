import { test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 1: true - billing cycle starts after trial")}`, async () => {
	const customerId = "reset-trial-end-true";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-reset",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		transition_rules: {
			reset_after_trial_end: [TestFeature.Messages],
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(7), 1).getTime(),
	});
});

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 2: no transition_rules - reset at trial end")}`, async () => {
	const customerId = "reset-trial-end-false";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-no-reset",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});
});

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 3: no options - reset at trial end")}`, async () => {
	const customerId = "reset-trial-end-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-default",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});
});

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 4: true but no trial - no effect")}`, async () => {
	const customerId = "reset-trial-end-no-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro-no-trial",
		items: [messagesItem],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		transition_rules: {
			reset_after_trial_end: [TestFeature.Messages],
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});
});

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 5: per-feature config")}`, async () => {
	const customerId = "reset-trial-end-per-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-multi",
		items: [messagesItem, wordsItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		transition_rules: {
			reset_after_trial_end: [TestFeature.Messages],
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: proTrial.id });
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(7), 1).getTime(),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});
});

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 6: upgrade with trial + config")}`, async () => {
	const customerId = "reset-trial-end-upgrade";

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free-upgrade-test",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-upgrade",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, proTrial] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: free.id });

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
		transition_rules: {
			reset_after_trial_end: [TestFeature.Messages],
		},
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: proTrial.id,
	});
	await expectProductTrialing({
		customer: customerAfter,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(7), 1).getTime(),
	});
});

test.concurrent(`${chalk.yellowBright("reset-after-trial-end 7: true with long trial (60 days)")}`, async () => {
	const customerId = "reset-trial-end-long-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proLongTrial = products.proWithTrial({
		id: "pro-long-trial",
		items: [messagesItem],
		trialDays: 60,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proLongTrial] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proLongTrial.id,
		redirect_mode: "if_required",
		transition_rules: {
			reset_after_trial_end: [TestFeature.Messages],
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: proLongTrial.id });
	await expectProductTrialing({
		customer,
		productId: proLongTrial.id,
		trialEndsAt: advancedTo + ms.days(60),
		toleranceMs: ms.hours(3),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(60), 1).getTime(),
		toleranceMs: ms.hours(3),
	});
});
