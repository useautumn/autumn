import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	CusProductStatus,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { expectResetAnchoredTo, getCustomerProduct } from "./utils";

test(`${chalk.yellowBright("start_date: future attach creates scheduled subscription")}`, async () => {
	const customerId = "attach-start-date-future";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const startDate = advancedTo + ms.days(1);
	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		start_date: startDate,
	});
	expect(preview.total).toBe(0);

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		start_date: startDate,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductScheduled({ customer, productId: pro.id, startsAt: startDate });

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
	expect(cusProduct.subscription_ids ?? []).toEqual([]);
	expect(cusProduct.scheduled_ids).toHaveLength(1);
	expectResetAnchoredTo({
		cusProduct,
		featureId: TestFeature.Messages,
		startDate,
	});

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		cusProduct.scheduled_ids![0]!,
	)) as Stripe.SubscriptionSchedule;
	expect(stripeSchedule.phases[0]?.start_date).toBe(Math.floor(startDate / 1000));
	await expectCustomerInvoiceCorrect({ customerId, count: 0 });
});

test(`${chalk.yellowBright("start_date: now attaches immediately")}`, async () => {
	const customerId = "attach-start-date-now";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		start_date: advancedTo,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.status).toBe(CusProductStatus.Active);
	expect(cusProduct.subscription_ids?.length).toBe(1);
	expect(cusProduct.scheduled_ids ?? []).toEqual([]);
	expectResetAnchoredTo({
		cusProduct,
		featureId: TestFeature.Messages,
		startDate: advancedTo,
	});
});

test(`${chalk.yellowBright("start_date: test clock start links and activates subscription")}`, async () => {
	const customerId = "attach-start-date-clock";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	expect(testClockId).toBeDefined();
	const startDate = advancedTo + ms.days(1);
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		start_date: startDate,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: startDate + ms.hours(1),
		waitForSeconds: 30,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.subscription_ids?.length).toBe(1);
});
