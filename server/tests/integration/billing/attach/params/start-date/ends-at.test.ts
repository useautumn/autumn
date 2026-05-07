import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	CusProductStatus,
	ErrCode,
} from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, subDays } from "date-fns";
import type Stripe from "stripe";
import { getCustomerProduct } from "./utils";

test.concurrent(`${chalk.yellowBright("ends-at: immediate attach sets subscription cancel_at")}`, async () => {
	const customerId = "attach-ends-at-immediate";
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

	const endsAt = addDays(advancedTo, 7).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		ends_at: endsAt,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	const cusProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(cusProduct.ended_at).toBe(endsAt);
	expect(cusProduct.subscription_ids).toHaveLength(1);

	const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
		cusProduct.subscription_ids![0]!,
	);
	expect(stripeSubscription.cancel_at).toBe(Math.floor(endsAt / 1000));
});

test.concurrent(`${chalk.yellowBright("ends-at: one-off attach sets access expiry")}`, async () => {
	const customerId = "attach-ends-at-one-off";
	const oneOff = products.oneOff({
		id: "one-off",
		items: [
			items.oneOffMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const endsAt = addDays(advancedTo, 7).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: oneOff.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		ends_at: endsAt,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const purchase = customer.purchases.find((p) => p.plan_id === oneOff.id);
	expect(purchase).toBeDefined();
	expect(purchase?.expires_at).toBe(endsAt);

	const cusProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: oneOff.id,
	});
	expect(cusProduct.ended_at).toBe(endsAt);
	expect(cusProduct.subscription_ids ?? []).toHaveLength(0);
	expect(cusProduct.scheduled_ids ?? []).toHaveLength(0);
});

test.concurrent(`${chalk.yellowBright("ends-at: future attach creates bounded schedule phase")}`, async () => {
	const customerId = "attach-starts-ends-at-future";
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

	const startsAt = addDays(advancedTo, 1).getTime();
	const endsAt = addDays(advancedTo, 7).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		starts_at: startsAt,
		ends_at: endsAt,
	});

	const cusProduct = await getCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
	expect(cusProduct.starts_at).toBe(startsAt);
	expect(cusProduct.ended_at).toBe(endsAt);
	expect(cusProduct.scheduled_ids).toHaveLength(1);

	const stripeSchedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
		cusProduct.scheduled_ids![0]!,
	)) as Stripe.SubscriptionSchedule;
	expect(stripeSchedule.phases[0]?.start_date).toBe(
		Math.floor(startsAt / 1000),
	);
	expect(stripeSchedule.phases[0]?.end_date).toBe(Math.floor(endsAt / 1000));
	expect(stripeSchedule.end_behavior).toBe("cancel");
});

test.concurrent(
	`${chalk.yellowBright("ends-at: past dates are rejected")}`,
	async () => {
		const customerId = "attach-end-date-past";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "ends_at cannot be set to a past timestamp",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					ends_at: subDays(advancedTo, 1).getTime(),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("ends-at: must be after starts_at")}`,
	async () => {
		const customerId = "attach-end-date-before-start";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "ends_at must be after the plan start timestamp",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					starts_at: addDays(advancedTo, 7).getTime(),
					ends_at: addDays(advancedTo, 1).getTime(),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("ends-at: rejects free plans")}`,
	async () => {
		const customerId = "attach-end-date-free";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free] })],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "ends_at is only supported for paid plans",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: free.id,
					ends_at: addDays(advancedTo, 7).getTime(),
				}),
		});
	},
);
