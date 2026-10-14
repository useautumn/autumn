import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel trial EOC: basic cancel, empty zero next cycle, no invoice after advance")}`, async () => {
	const customerId = "cancel-trial-eoc-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const trialEndsAt = await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(0);

	expectPreviewNextCycleCorrect({
		preview,
		startsAt: trialEndsAt!,
		total: 0,
		toleranceMs: 1000,
	});
	expect(preview.next_cycle?.subtotal).toBe(0);
	expect(preview.next_cycle?.line_items).toEqual([]);
	expect(preview.next_cycle?.usage_line_items).toEqual([]);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: advancedTo + ms.days(10),
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: proTrial.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 1,
		latestTotal: 0,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial EOC: with consumable messages, no overage invoice")}`, async () => {
	const customerId = "cancel-trial-eoc-consumable";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	const initialInvoiceCount = customerAfterCancel.invoices?.length ?? 0;

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: proTrial.id,
	});

	const finalInvoiceCount = customerAfterAdvance.invoices?.length ?? 0;
	const latestInvoice = customerAfterAdvance.invoices?.[0];

	if (finalInvoiceCount > initialInvoiceCount) {
		expect(latestInvoice?.total).toBe(0);
	}
});

test.concurrent(`${chalk.yellowBright("cancel trial EOC: premium trial with pro scheduled, cancel removes scheduled")}`, async () => {
	const customerId = "cancel-trial-eoc-scheduled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [s.attach({ productId: premiumTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: premiumTrial.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premiumTrial.id,
	});

	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premiumTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: premiumTrial.id,
	});

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: premiumTrial.id,
	});

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	const invoices = customerAfterAdvance.invoices ?? [];
	for (const invoice of invoices) {
		expect(invoice.total).toBe(0);
	}
});

test.concurrent(`${chalk.yellowBright("cancel trial EOC: with free default, free scheduled")}`, async () => {
	const customerId = "cancel-trial-eoc-free-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [proTrial.id],
		scheduled: [free.id],
	});

	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
		startsAt: Date.now() + ms.days(7),
		toleranceMs: ms.hours(1),
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [free.id],
		notPresent: [proTrial.id],
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 1,
		latestTotal: 0,
		latestInvoiceProductId: proTrial.id,
	});
});
