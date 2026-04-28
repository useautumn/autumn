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
