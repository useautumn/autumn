import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV0Input,
	type AttachParamsV1Input,
	CusProductStatus,
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
import { addDays, addHours, addMinutes } from "date-fns";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import {
	expectResetAnchoredTo,
	getCustomerProduct,
	triggerSubscriptionCreated,
} from "./utils";

const getScheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	typeof schedule.subscription === "string"
		? schedule.subscription
		: schedule.subscription?.id;

test.concurrent(`${chalk.yellowBright("start_date: future attach creates scheduled subscription")}`, async () => {
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

	const startDate = addDays(advancedTo, 1).getTime();
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

test.concurrent(`${chalk.yellowBright("start_date: beta attach creates scheduled subscription")}`, async () => {
	const customerId = "attach-start-date-beta";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1Beta, autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const startDate = addDays(advancedTo, 1).getTime();
	const preview = await autumnV1Beta.billing.previewAttach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		start_date: startDate,
	});
	expect(preview.total).toBe(0);

	await autumnV1Beta.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		start_date: startDate,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductScheduled({ customer, productId: pro.id, startsAt: startDate });

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
	expect(cusProduct.subscription_ids ?? []).toEqual([]);
	expect(cusProduct.scheduled_ids).toHaveLength(1);

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		cusProduct.scheduled_ids![0]!,
	)) as Stripe.SubscriptionSchedule;
	expect(stripeSchedule.phases[0]?.start_date).toBe(Math.floor(startDate / 1000));
});

test.concurrent(`${chalk.yellowBright("start_date: now attaches immediately")}`, async () => {
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

test.concurrent(`${chalk.yellowBright("start_date: test clock start links and activates subscription")}`, async () => {
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
	const startDate = addDays(advancedTo, 1).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		start_date: startDate,
	});

	const scheduledProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	const scheduleId = scheduledProduct.scheduled_ids?.[0];
	expect(scheduleId).toBeDefined();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(startDate, 1).getTime(),
		waitForSeconds: 30,
	});

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId!,
	)) as Stripe.SubscriptionSchedule;
	const stripeSubId = getScheduleSubscriptionId(stripeSchedule);
	if (!stripeSubId) throw new Error("Expected schedule to have a subscription");

	await triggerSubscriptionCreated({
		ctx,
		stripeSubId,
		scheduleId,
		subscriptionCreatedAtMs: addMinutes(startDate, 5).getTime(),
		fullCustomer: await CusService.getFull({ ctx, idOrInternalId: customerId }),
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.status).toBe(CusProductStatus.Active);
	expect(cusProduct.subscription_ids).toEqual([stripeSubId]);
});
