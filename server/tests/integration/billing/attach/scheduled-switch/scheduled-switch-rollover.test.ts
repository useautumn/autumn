import { test } from "bun:test";
import { type ApiCustomerV3, RolloverExpiryDurationType } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectCustomerRolloverCorrect,
	expectNoRollovers,
} from "@tests/integration/billing/utils/rollover/expectCustomerRolloverCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("scheduled-switch-rollover 1: downgrade with rollover carryover (same cap)")}`, async () => {
	const customerId = "sched-switch-rollover-same-cap";

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

	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
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

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
			s.billing.attach({ productId: free.id, timeout: 2000 }),
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		active: [free.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		balance: 300,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 200 }],
		totalBalance: 300,
	});
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-rollover 2: downgrade with rollover capped by lower max")}`, async () => {
	const customerId = "sched-switch-rollover-lower-cap";

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

	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
		rolloverConfig: {
			max: 150,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
			s.billing.attach({ productId: free.id }),
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		active: [free.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		balance: 250,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
		totalBalance: 250,
	});
});

test.concurrent(`${chalk.yellowBright("scheduled-switch-rollover 3: downgrade to plan without rollover - no carryover")}`, async () => {
	const customerId = "sched-switch-rollover-no-rollover";

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

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
			s.billing.attach({ productId: free.id }),
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		active: [free.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectNoRollovers({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
	});
});
