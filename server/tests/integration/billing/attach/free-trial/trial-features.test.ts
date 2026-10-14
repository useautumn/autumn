import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("trial-features 1: prepaid messages during trial")}`, async () => {
	const customerId = "trial-feat-prepaid-messages";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const productWithTrial = products.base({
		id: "prepaid-trial",
		items: [prepaidItem, priceItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productWithTrial] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: productWithTrial.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 30,
	});

	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: productWithTrial.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			redirect_mode: "if_required",
		},
		{
			timeout: 5000,
		},
	);

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: productWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});
	await new Promise((r) => setTimeout(r, 2000));

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 150,
		usage: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-features 2: allocated seats during trial")}`, async () => {
	const customerId = "trial-feat-allocated-seats";

	const seatsItem = items.allocatedUsers({ includedUsage: 3 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const productWithTrial = products.base({
		id: "seats-trial",
		items: [seatsItem, priceItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productWithTrial] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: productWithTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: productWithTrial.id,
		redirect_mode: "if_required",
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: productWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});
	await new Promise((r) => setTimeout(r, 5000));

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2,
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	const advancedToAfter = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotTrialing({
		customer,
		productId: productWithTrial.id,
		nowMs: advancedToAfter,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 20 + 2 * 10,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2,
		usage: 5,
	});
});

test.concurrent(`${chalk.yellowBright("trial-features 3: consumable (arrears) during trial")}`, async () => {
	const customerId = "trial-feat-consumable";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const productWithTrial = products.base({
		id: "consumable-trial",
		items: [consumableItem, priceItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productWithTrial] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: productWithTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: productWithTrial.id,
		redirect_mode: "if_required",
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: productWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});
	await new Promise((r) => setTimeout(r, 2000));

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50,
		usage: 150,
	});

	const advancedToAfter = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotTrialing({
		customer,
		productId: productWithTrial.id,
		nowMs: advancedToAfter,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50,
		usage: 150,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: productWithTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
