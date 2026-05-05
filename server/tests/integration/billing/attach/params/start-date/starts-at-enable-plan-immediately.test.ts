import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	CusProductStatus,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { expectResetAnchoredTo, getCustomerProduct } from "./utils";

test.concurrent(`${chalk.yellowBright("starts_at: enable_plan_immediately activates access before billing")}`, async () => {
	const customerId = "attach-start-date-enable-immediate";
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
		starts_at: startDate,
		enable_plan_immediately: true,
	});
	expect(preview.total).toBe(0);

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		starts_at: startDate,
		enable_plan_immediately: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	await expectCustomerInvoiceCorrect({ customerId, count: 0 });

	const cusProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(cusProduct.status).toBe(CusProductStatus.Active);
	expect(cusProduct.subscription_ids ?? []).toEqual([]);
	expect(cusProduct.scheduled_ids).toHaveLength(1);
	expect(Math.abs(cusProduct.starts_at - advancedTo)).toBeLessThan(
		ms.minutes(10),
	);
	expectResetAnchoredTo({
		cusProduct,
		featureId: TestFeature.Messages,
		startDate,
	});

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		cusProduct.scheduled_ids![0]!,
	)) as Stripe.SubscriptionSchedule;
	expect(stripeSchedule.phases[0]?.start_date).toBe(
		Math.floor(startDate / 1000),
	);
});

test.concurrent(`${chalk.yellowBright("starts_at: upgrade access can start before billing switch")}`, async () => {
	const customerId = "attach-starts-at-upgrade-enable-immediate";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const startsAt = addDays(advancedTo, 7).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		starts_at: startsAt,
		enable_plan_immediately: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	const premiumCustomerProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: premium.id,
	});
	expect(premiumCustomerProduct.status).toBe(CusProductStatus.Active);
	expect(premiumCustomerProduct.scheduled_ids).toHaveLength(1);
	expect(Math.abs(premiumCustomerProduct.starts_at - advancedTo)).toBeLessThan(
		ms.minutes(10),
	);
	expectResetAnchoredTo({
		cusProduct: premiumCustomerProduct,
		featureId: TestFeature.Messages,
		startDate: startsAt,
	});

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		premiumCustomerProduct.scheduled_ids![0]!,
	)) as Stripe.SubscriptionSchedule;
	const futurePhase = stripeSchedule.phases.find(
		(phase) => phase.start_date === Math.floor(startsAt / 1000),
	);
	expect(futurePhase).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("starts_at: add-on access can start before billing")}`, async () => {
	const customerId = "attach-starts-at-addon-enable-immediate";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const startsAt = addDays(advancedTo, 7).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: addon.id,
		starts_at: startsAt,
		enable_plan_immediately: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: addon.id });
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	const addonCustomerProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: addon.id,
	});
	expect(addonCustomerProduct.status).toBe(CusProductStatus.Active);
	expect(addonCustomerProduct.scheduled_ids).toHaveLength(1);
	expect(Math.abs(addonCustomerProduct.starts_at - advancedTo)).toBeLessThan(
		ms.minutes(10),
	);
	expectResetAnchoredTo({
		cusProduct: addonCustomerProduct,
		featureId: TestFeature.Users,
		startDate: startsAt,
	});

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		addonCustomerProduct.scheduled_ids![0]!,
	)) as Stripe.SubscriptionSchedule;
	const futurePhase = stripeSchedule.phases.find(
		(phase) => phase.start_date === Math.floor(startsAt / 1000),
	);
	expect(futurePhase).toBeDefined();
	expect(futurePhase!.items.length).toBeGreaterThan(
		stripeSchedule.phases[0]?.items.length ?? 0,
	);
});
