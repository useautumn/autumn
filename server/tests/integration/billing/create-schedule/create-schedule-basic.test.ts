import { expect, test } from "bun:test";
import {
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";

test.concurrent(`${chalk.yellowBright("create-schedule: creates sorted phases and scheduled customer products")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyWords({ includedUsage: 25 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-basic",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const now = Date.now();
	const params: CreateScheduleParamsV0Input = {
		customer_id: customerId,
		phases: [
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: pro.id }],
			},
			{
				starts_at: now,
				plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
			},
		],
	};

	const response = await autumnV1.billing.createSchedule(params);

	expect(response.customer_id).toBe(customerId);
	expect(response.entity_id).toBeNull();
	expect(response.payment_url).toBeNull();
	expect(response.phases).toHaveLength(2);
	expect(response.phases[0]!.starts_at).toBe(now);
	expect(response.phases[0]!.customer_product_ids).toHaveLength(2);
	expect(response.phases[1]!.starts_at).toBe(now + ms.days(30));
	expect(response.phases[1]!.customer_product_ids).toHaveLength(1);

	const dbSchedule = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.id, response.schedule_id));
	expect(dbSchedule).toHaveLength(1);

	const dbPhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, response.schedule_id));
	expect(dbPhases).toHaveLength(2);

	const insertedCustomerProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			inArray(
				customerProducts.id,
				response.phases.flatMap(
					(phase: { customer_product_ids: string[] }) =>
						phase.customer_product_ids,
				),
			),
		);

	expect(insertedCustomerProducts).toHaveLength(3);
	expect(
		insertedCustomerProducts.every(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		),
	).toBe(true);
	expect(
		insertedCustomerProducts.filter(
			(customerProduct) => customerProduct.product_id === pro.id,
		),
	).toHaveLength(2);
	expect(
		insertedCustomerProducts.filter(
			(customerProduct) => customerProduct.product_id === addon.id,
		),
	).toHaveLength(1);
});

test.concurrent(`${chalk.yellowBright("create-schedule: copies entity_id and replaces the prior schedule")}`, async () => {
	const seats = products.base({
		id: "seats",
		items: [items.prepaidUsers()],
	});
	const backup = products.base({
		id: "backup",
		items: [items.prepaidMessages()],
		group: "backup",
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "create-schedule-replace",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [seats, backup] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0]!.id;
	const now = Date.now();

	const firstResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		entity_id: entityId,
		phases: [
			{
				starts_at: now,
				plans: [
					{
						plan_id: seats.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Users,
								quantity: 3,
							},
						],
					},
				],
			},
		],
	});

	const firstCustomerProductId =
		firstResponse.phases[0]!.customer_product_ids[0]!;

	const secondResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		entity_id: entityId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: backup.id }],
			},
		],
	});

	const dbSchedules = await ctx.db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.customer_id, customerId),
				eq(schedules.entity_id, entityId),
			),
		);
	expect(dbSchedules).toHaveLength(1);
	expect(dbSchedules[0]!.id).toBe(secondResponse.schedule_id);

	const removedCustomerProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, firstCustomerProductId));
	expect(removedCustomerProducts).toHaveLength(0);

	const newCustomerProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			inArray(
				customerProducts.id,
				secondResponse.phases.flatMap(
					(phase: { customer_product_ids: string[] }) =>
						phase.customer_product_ids,
				),
			),
		);

	expect(newCustomerProducts).toHaveLength(1);
	expect(newCustomerProducts[0]!.entity_id).toBe(entityId);

	const firstScheduleProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, firstCustomerProductId));
	expect(firstScheduleProducts).toHaveLength(0);
});

test.concurrent(`${chalk.yellowBright("create-schedule: preserves feature quantity options on created customer products")}`, async () => {
	const prepaidMessages = products.base({
		id: "prepaid",
		items: [items.prepaidMessages()],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-options",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaidMessages] }),
		],
		actions: [],
	});

	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: Date.now(),
				plans: [
					{
						plan_id: prepaidMessages.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								quantity: 400,
							},
						],
					},
				],
			},
		],
	});

	const insertedProducts = await ctx.db
		.select({
			options: customerProducts.options,
		})
		.from(customerProducts)
		.where(
			eq(customerProducts.id, response.phases[0]!.customer_product_ids[0]!),
		);

	expect(insertedProducts).toHaveLength(1);
	expect(insertedProducts[0]!.options).toEqual([
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			quantity: 4,
		}),
	]);
});

test.concurrent(`${chalk.yellowBright("create-schedule: preserves customize.items on created customer products")}`, async () => {
	const base = products.base({
		id: "custom-base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-customize",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: Date.now(),
				plans: [
					{
						plan_id: base.id,
						customize: {
							items: [itemsV2.monthlyWords({ included: 250 })],
						},
					},
				],
			},
		],
	});

	const insertedEntitlements = await ctx.db
		.select({
			feature_id: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.where(
			eq(
				customerEntitlements.customer_product_id,
				response.phases[0]!.customer_product_ids[0]!,
			),
		);

	expect(insertedEntitlements).toEqual([
		{
			feature_id: TestFeature.Words,
			balance: 250,
		},
	]);
});

test.concurrent(`${chalk.yellowBright("create-schedule: rejects invalid timing and entity input")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "create-schedule-errors",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errMessage: "The first phase must start immediately",
		func: async () => {
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				phases: [
					{
						starts_at: Date.now() - ms.days(1),
						plans: [{ plan_id: pro.id }],
					},
				],
			});
		},
	});

	await expectAutumnError({
		errMessage: "The first phase must start immediately",
		func: async () => {
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				phases: [
					{
						starts_at: Date.now() + ms.days(1),
						plans: [{ plan_id: pro.id }],
					},
				],
			});
		},
	});

	await expectAutumnError({
		errMessage: "Phase starts_at values must be strictly increasing",
		func: async () => {
			const duplicateStartsAt = Date.now();
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				phases: [
					{
						starts_at: duplicateStartsAt,
						plans: [{ plan_id: pro.id }],
					},
					{
						starts_at: duplicateStartsAt,
						plans: [{ plan_id: pro.id }],
					},
				],
			});
		},
	});

	await expectAutumnError({
		errMessage: "not found",
		func: async () => {
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				entity_id: "missing-entity",
				phases: [
					{
						starts_at: Date.now(),
						plans: [{ plan_id: pro.id }],
					},
				],
			});
		},
	});

	await expectAutumnError({
		errMessage: "subscription_id is not supported",
		func: async () => {
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				phases: [
					{
						starts_at: Date.now(),
						plans: [
							{
								plan_id: pro.id,
								subscription_id: "sub_123",
							},
						],
					},
				],
			});
		},
	});
});
