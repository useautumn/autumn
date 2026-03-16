import { test } from "bun:test";
import { type ApiCustomerV3, tryCatch } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	calculateTrialEndMs,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils";

test("temp: paid default trial customer can upgrade to premium", async () => {
	const customerId = `temp-default-trial-upgrade`;

	const defaultTrial = products.defaultTrial({
		id: "default-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: 7,
		cardRequired: false,
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, withDefault: true }),
			s.products({ list: [defaultTrial, premium] }),
		],
		actions: [],
	});

	const customerBeforeUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerBeforeUpgrade,
		productId: defaultTrial.id,
		trialEndsAt: calculateTrialEndMs({ trialDays: 7 }),
	});

	expectCustomerFeatureCorrect({
		customer: customerBeforeUpgrade,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	try {
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			// redirect_mode: "redirect_mode",
		});
	} catch (error) {}

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 12,
	});
});
