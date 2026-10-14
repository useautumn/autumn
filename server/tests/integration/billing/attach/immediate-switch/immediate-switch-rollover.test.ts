import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import {
	expectCustomerRolloverCorrect,
	expectNoRollovers,
} from "@tests/integration/billing/utils/rollover/expectCustomerRolloverCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 1: upgrade with rollover carryover (same cap)")}`, async () => {
	const customerId = "imm-switch-rollover-same-cap";

	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		balance: 550,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 650,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
		totalBalance: 650,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 2: upgrade with rollover capped by lower max")}`, async () => {
	const customerId = "imm-switch-rollover-lower-cap";

	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 200,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 350 }],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 700,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 200 }],
		totalBalance: 700,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 3: upgrade with rollover - higher cap allows full carryover")}`, async () => {
	const customerId = "imm-switch-rollover-higher-cap";

	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 200,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 1000,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 650,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
		totalBalance: 650,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 4: upgrade to plan without rollover - no carryover")}`, async () => {
	const customerId = "imm-switch-rollover-no-rollover";

	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	expectNoRollovers({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-rollover: prepaid credits + max_percentage rollover carries from annual to monthly")}`, async () => {
	const customerId = "imm-switch-rollover-prepaid-annual-to-monthly";
	const rolloverConfig = {
		max_percentage: 50,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const annualCreditsItem = constructPrepaidItem({
		featureId: TestFeature.Credits,
		includedUsage: 100,
		billingUnits: 1,
		price: 0.25,
		rolloverConfig,
	});

	const monthlyCreditsItem = constructPrepaidItem({
		featureId: TestFeature.Credits,
		includedUsage: 100,
		billingUnits: 1,
		price: 0.25,
		rolloverConfig,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-rollover-prepaid",
		items: [annualCreditsItem],
	});

	const proMonthly = products.pro({
		id: "pro-monthly-rollover-prepaid",
		items: [monthlyCreditsItem],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, proMonthly] }),
		],
		actions: [
			s.billing.attach({
				productId: proAnnual.id,
				options: [{ feature_id: TestFeature.Credits, quantity: 1500 }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterInvoice =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfterInvoice,
		featureId: TestFeature.Credits,
		remaining: 1500 + 750,
		usage: 0,
		rollovers: [{ balance: 750 }],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: proMonthly.id,
		redirect_mode: "if_required",
	});

	const customerAfterSwitch =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfterSwitch,
		featureId: TestFeature.Credits,
		remaining: 1500 + 750,
		usage: 0,
		rollovers: [{ balance: 750 }],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
