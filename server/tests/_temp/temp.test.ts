import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(`${chalk.yellowBright("temp: pro annual prepaid credits with rollover carries to pro monthly")}`, async () => {
	const customerId = "temp-annual-prepaid-rollover";
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
		id: "pro-annual-rollover",
		items: [annualCreditsItem],
	});

	const pro = products.pro({
		id: "pro-monthly-rollover",
		items: [monthlyCreditsItem],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: proAnnual.id,
				options: [{ feature_id: TestFeature.Credits, quantity: 1500 }],
			}),
			// s.track({ featureId: TestFeature.Action1, value: 10, timeout: 2000 }),
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
		plan_id: pro.id,
		redirect_mode: "if_required",
		// feature_quantities: [{ feature_id: TestFeature.Credits, quantity: 750 }],
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

test.concurrent(`${chalk.yellowBright("temp: pro prepaid messages rollover persists after price update")}`, async () => {
	const customerId = "temp-pro-prepaid-msgs-price-update";
	const rolloverConfig = {
		max_percentage: 50,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const messagesItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 1,
		price: 0.1,
		rolloverConfig,
	});

	const updatedMessagesItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 1,
		price: 0.2,
		rolloverConfig,
	});

	const pro = products.pro({
		id: "pro-prepaid-msgs-price-update",
		items: [messagesItem],
	});

	const quantity = 1500;

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	// After invoice: rollover = 50% of 1500 = 750
	// New balance = 1500 + 750 = 2250
	const expectedRollover = quantity / 2;
	const expectedRemaining = quantity + expectedRollover;

	const customerAfterInvoice =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfterInvoice,
		featureId: TestFeature.Messages,
		remaining: expectedRemaining,
		usage: 0,
		rollovers: [{ balance: expectedRollover }],
	});

	// Update subscription to change prepaid messages price
	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem],
	});

	const customerAfterUpdate =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfterUpdate,
		featureId: TestFeature.Messages,
		remaining: expectedRemaining,
		usage: 0,
		rollovers: [{ balance: expectedRollover }],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
