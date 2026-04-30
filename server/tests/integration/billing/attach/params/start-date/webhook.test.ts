import { expect, test } from "bun:test";
import { type AttachParamsV1Input, CusProductStatus, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { getCustomerProduct, triggerSubscriptionCreated } from "./utils";

test.concurrent(`${chalk.yellowBright("start_date: subscription.created links scheduled product")}`, async () => {
	const customerId = "attach-start-date-webhook";
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
		start_date: advancedTo + ms.days(1),
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	const scheduleId = cusProduct.scheduled_ids?.[0];
	expect(scheduleId).toBeDefined();

	const stripeSubId = "sub_attach_start_date_webhook";
	await triggerSubscriptionCreated({ ctx, stripeSubId, scheduleId });

	const updatedProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(updatedProduct.subscription_ids).toEqual([stripeSubId]);
});

test.concurrent(`${chalk.yellowBright("start_date: subscription.created link is idempotent")}`, async () => {
	const customerId = "attach-start-date-webhook-idempotent";
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
		start_date: advancedTo + ms.days(1),
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	const stripeSubId = "sub_attach_start_date_idempotent";
	for (let i = 0; i < 2; i++) {
		await triggerSubscriptionCreated({
			ctx,
			stripeSubId,
			scheduleId: cusProduct.scheduled_ids?.[0],
		});
	}

	const updatedProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(updatedProduct.subscription_ids).toEqual([stripeSubId]);
});

test.concurrent(`${chalk.yellowBright("start_date: subscription.created retry can activate after missing fullCustomer")}`, async () => {
	const customerId = "attach-start-date-webhook-retry-activation";
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
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		start_date: startDate,
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	const scheduleId = cusProduct.scheduled_ids?.[0];
	const stripeSubId = "sub_attach_start_date_retry_activation";

	await triggerSubscriptionCreated({
		ctx,
		stripeSubId,
		scheduleId,
		subscriptionCreatedAtMs: startDate + ms.minutes(5),
	});

	const skippedProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(skippedProduct.subscription_ids ?? []).toEqual([]);
	expect(skippedProduct.status).toBe(CusProductStatus.Scheduled);

	await triggerSubscriptionCreated({
		ctx,
		stripeSubId,
		scheduleId,
		subscriptionCreatedAtMs: startDate + ms.minutes(5),
		fullCustomer: await CusService.getFull({ ctx, idOrInternalId: customerId }),
	});

	const activatedProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(activatedProduct.subscription_ids).toEqual([stripeSubId]);
	expect(activatedProduct.status).toBe(CusProductStatus.Active);
});

test.concurrent(`${chalk.yellowBright("start_date: subscription.created ignores missing schedule")}`, async () => {
	const customerId = "attach-start-date-webhook-no-schedule";
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
		start_date: advancedTo + ms.days(1),
	});

	await triggerSubscriptionCreated({
		ctx,
		stripeSubId: "sub_attach_start_date_no_schedule",
		scheduleId: null,
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.subscription_ids ?? []).toEqual([]);
});

test.concurrent(`${chalk.yellowBright("start_date: subscription.created ignores unknown schedule")}`, async () => {
	const customerId = "attach-start-date-webhook-unknown-schedule";
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
		start_date: advancedTo + ms.days(1),
	});

	await triggerSubscriptionCreated({
		ctx,
		stripeSubId: "sub_attach_start_date_unknown_schedule",
		scheduleId: "sub_sched_unknown",
	});

	const cusProduct = await getCustomerProduct({ ctx, customerId, productId: pro.id });
	expect(cusProduct.subscription_ids ?? []).toEqual([]);
});
