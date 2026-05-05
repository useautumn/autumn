import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV0,
	type AttachParamsV0Input,
	type AttachParamsV1Input,
	CusProductStatus,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addHours, addMinutes, addMonths } from "date-fns";
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

test.concurrent(
	`${chalk.yellowBright("starts_at: future attach creates scheduled subscription")}`,
	async () => {
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
		const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: pro.id,
				starts_at: startDate,
			},
		);
		expect(preview.total).toBe(0);

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startDate,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductScheduled({
			customer,
			productId: pro.id,
			startsAt: startDate,
		});

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
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
		expect(stripeSchedule.phases[0]?.start_date).toBe(
			Math.floor(startDate / 1000),
		);
		await expectCustomerInvoiceCorrect({ customerId, count: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: beta attach creates scheduled subscription")}`,
	async () => {
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
		const preview =
			await autumnV1Beta.billing.previewAttach<AttachParamsV0Input>({
				customer_id: customerId,
				product_id: pro.id,
				starts_at: startDate,
			});
		expect(preview.total).toBe(0);

		await autumnV1Beta.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			starts_at: startDate,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductScheduled({
			customer,
			productId: pro.id,
			startsAt: startDate,
		});

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
		expect(cusProduct.subscription_ids ?? []).toEqual([]);
		expect(cusProduct.scheduled_ids).toHaveLength(1);

		const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
			cusProduct.scheduled_ids![0]!,
		)) as Stripe.SubscriptionSchedule;
		expect(stripeSchedule.phases[0]?.start_date).toBe(
			Math.floor(startDate / 1000),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: now attaches immediately")}`,
	async () => {
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
			starts_at: advancedTo,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({ customer, productId: pro.id });

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct.status).toBe(CusProductStatus.Active);
		expect(cusProduct.subscription_ids?.length).toBe(1);
		expect(cusProduct.scheduled_ids ?? []).toEqual([]);
		expectResetAnchoredTo({
			cusProduct,
			featureId: TestFeature.Messages,
			startDate: advancedTo,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: entity attach with existing scheduled switch")}`,
	async () => {
		const customerId = "attach-starts-at-entity-existing-schedule";
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: premium.id, entityIndex: 0 })],
		});

		const entityAId = entities[0].id;
		const entityBId = entities[1].id;
		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityAId,
		});

		const startsAt = addDays(advancedTo, 10).getTime();
		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityBId,
			starts_at: startsAt,
		});

		const entityA = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityAId,
		);
		const entityB = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityBId,
		);
		await expectProductCanceling({ customer: entityA, productId: premium.id });
		await expectProductScheduled({ customer: entityA, productId: pro.id });
		await expectProductScheduled({
			customer: entityB,
			productId: pro.id,
			startsAt,
		});

		const entityBCusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
			entityId: entityBId,
		});
		expect(entityBCusProduct.status).toBe(CusProductStatus.Scheduled);
		expect(entityBCusProduct.scheduled_ids?.length).toBeGreaterThan(0);
		expect(Math.abs(entityBCusProduct.starts_at - startsAt)).toBeLessThan(
			ms.minutes(10),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: entity attach creates new billing subscription beside existing schedule")}`,
	async () => {
		const customerId = "attach-starts-at-entity-new-sub-existing-schedule";
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: premium.id, entityIndex: 0 })],
		});

		const entityAId = entities[0].id;
		const entityBId = entities[1].id;
		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityAId,
		});

		const startsAt = addDays(advancedTo, 10).getTime();
		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityBId,
			starts_at: startsAt,
			new_billing_subscription: true,
		});

		const entityBCusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
			entityId: entityBId,
		});
		expect(entityBCusProduct.status).toBe(CusProductStatus.Scheduled);
		expect(entityBCusProduct.subscription_ids ?? []).toEqual([]);
		expect(entityBCusProduct.scheduled_ids).toHaveLength(1);
		expect(Math.abs(entityBCusProduct.starts_at - startsAt)).toBeLessThan(
			ms.minutes(10),
		);

		const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
			entityBCusProduct.scheduled_ids![0]!,
		)) as Stripe.SubscriptionSchedule;
		expect(stripeSchedule.phases[0]?.start_date).toBe(
			Math.floor(startsAt / 1000),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: immediate attach replaces scheduled plan")}`,
	async () => {
		const customerId = "attach-starts-at-future-then-immediate";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: addDays(advancedTo, 7).getTime(),
		});
		const customerWithScheduledPro =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductScheduled({
			customer: customerWithScheduledPro,
			productId: pro.id,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: custom switch date schedules plan change")}`,
	async () => {
		const customerId = "attach-starts-at-custom-switch";
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		const startsAt = addMonths(advancedTo, 2).getTime();
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id, startsAt });
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: add-on starts in the future")}`,
	async () => {
		const customerId = "attach-starts-at-addon";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
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
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({ customer, productId: pro.id });
		await expectProductScheduled({ customer, productId: addon.id, startsAt });
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: scheduled add-on is removed when base plan is canceled immediately")}`,
	async () => {
		const customerId = "attach-starts-at-addon-cancel-base";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});

		const { autumnV1, autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: addon.id,
			starts_at: addDays(advancedTo, 7).getTime(),
		});
		const customerWithScheduledAddon =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectProductScheduled({
			customer: customerWithScheduledAddon,
			productId: addon.id,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately",
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			notPresent: [pro.id, addon.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: test clock start links and activates subscription")}`,
	async () => {
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
			starts_at: startDate,
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
		if (!stripeSubId)
			throw new Error("Expected schedule to have a subscription");

		await triggerSubscriptionCreated({
			ctx,
			stripeSubId,
			scheduleId,
			subscriptionCreatedAtMs: addMinutes(startDate, 5).getTime(),
			fullCustomer: await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
			}),
		});

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct.status).toBe(CusProductStatus.Active);
		expect(cusProduct.subscription_ids).toEqual([stripeSubId]);
	},
);
