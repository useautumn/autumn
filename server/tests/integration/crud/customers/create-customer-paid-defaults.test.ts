import { expect, test } from "bun:test";
import { type ApiCustomerV3, BillingVersion } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	calculateTrialEndMs,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing.js";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { FreeTrialDuration } from "@autumn/shared";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT TRIAL PRODUCT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("paid-defaults: trial product")}`, async () => {
	const customerId = "paid-defaults-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });

	const trialDefault = products.defaultTrial({
		id: "trial-pro",
		items: [messagesItem],
		trialDays: 14,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, withDefault: true }),
			s.products({ list: [trialDefault] }),
		],
		actions: [],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: trialDefault.id,
		trialEndsAt: calculateTrialEndMs({ trialDays: 14 }),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId ?? "",
		numberOfDays: 18,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfter,
		productId: trialDefault.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 0,
	});
});

test.concurrent(`${chalk.yellowBright("paid-defaults: trial prepaid messages")}`, async () => {
	const customerId = "paid-defaults-trial-prepaid";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 200,
		price: 10,
	});

	const trialDefault = products.base({
		id: "trial-prepaid",
		items: [prepaidMessagesItem],
		isDefault: true,
		freeTrial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			cardRequired: false,
			uniqueFingerprint: false,
		},
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, withDefault: true }),
			s.products({ list: [trialDefault] }),
		],
		actions: [],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: trialDefault.id,
		trialEndsAt: calculateTrialEndMs({ trialDays: 7 }),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customer.id ?? "",
		orgId: ctx.org.id,
		env: ctx.env,
	});

	expect(fullCustomer.customer_products.length).toBe(1);
	expect(fullCustomer.customer_products[0].options?.[0]).toMatchObject({
		quantity: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
		billingVersion: BillingVersion.V2,
	});
});

test.concurrent(`${chalk.yellowBright("paid-defaults: same group priority (trial > paid > free)")}`, async () => {
	const customerId = "paid-defaults-priority";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const messagesItemHigh = items.monthlyMessages({ includedUsage: 1000 });

	// Free default in same group
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Trial default in same group - should take priority
	const trialDefault = products.defaultTrial({
		id: "trial-pro",
		items: [messagesItemHigh],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, withDefault: true }),
			s.products({ list: [freeDefault, trialDefault] }),
		],
		actions: [],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial product should be attached (higher priority than free)
	await expectProductTrialing({
		customer,
		productId: trialDefault.id,
		trialEndsAt: calculateTrialEndMs({ trialDays: 7 }),
	});

	// Balance should reflect trial product's higher allowance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 1000,
	});
});
