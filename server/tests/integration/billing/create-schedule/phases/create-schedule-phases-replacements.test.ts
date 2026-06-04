import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CusProductStatus,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import {
	getCustomerProductRows,
	getRequiredScheduleId,
} from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule: copies entity_id and replaces the prior schedule")}`,
	async () => {
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
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: backup.id }],
				},
			],
		});

		const firstScheduledCustomerProductId =
			firstResponse.phases[1]!.customer_product_ids[0]!;

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
		expect(dbSchedules[0]!.id).toBe(
			getRequiredScheduleId(secondResponse.schedule_id),
		);

		const removedScheduledProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, firstScheduledCustomerProductId));
		expect(removedScheduledProducts).toHaveLength(0);

		const removedSchedule = await ctx.db
			.select()
			.from(schedules)
			.where(
				eq(schedules.id, getRequiredScheduleId(firstResponse.schedule_id)),
			);
		expect(removedSchedule).toHaveLength(0);

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
		expect(newCustomerProducts[0]!.status).toBe(CusProductStatus.Active);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: allows multiple group replacements when they only conflict with current plans")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const usersItem = items.monthlyUsers({ includedUsage: 5 });

		const existingA = products.base({
			id: "create-schedule-existing-a",
			items: [messagesItem, items.monthlyPrice({ price: 5 })],
		});
		const existingB = products.base({
			id: "create-schedule-existing-b",
			items: [usersItem, items.monthlyPrice({ price: 5 })],
			group: "group-b",
		});
		const replacementA = products.pro({
			id: "create-schedule-replacement-a",
			items: [messagesItem],
		});
		const replacementB = products.base({
			id: "create-schedule-replacement-b",
			items: [usersItem, items.monthlyPrice({ price: 20 })],
			group: "group-b",
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "create-schedule-multi-replace",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [existingA, existingB, replacementA, replacementB],
				}),
			],
			actions: [
				s.billing.attach({ productId: existingA.id }),
				s.billing.attach({ productId: existingB.id }),
			],
		});

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: Date.now(),
					plans: [{ plan_id: replacementA.id }, { plan_id: replacementB.id }],
				},
			],
		});

		expect(response.customer_id).toBe(customerId);
		expect(response.phases).toHaveLength(1);
		expect(response.phases[0]!.customer_product_ids).toHaveLength(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: future replacements for an active group stay scheduled until their phase")}`,
	async () => {
		const currentGroupB = products.base({
			id: "create-schedule-current-group-b",
			items: [
				items.monthlyUsers({ includedUsage: 5 }),
				items.monthlyPrice({ price: 5 }),
			],
			group: "group-b",
		});
		const nowBase = products.pro({
			id: "create-schedule-active-now-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const futureReplacementB = products.base({
			id: "create-schedule-future-replacement-b",
			items: [
				items.monthlyMessages({ includedUsage: 200 }),
				items.monthlyPrice({ price: 15 }),
			],
			group: "group-b",
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-future-replacement-stays-scheduled",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [currentGroupB, nowBase, futureReplacementB],
				}),
			],
			actions: [s.billing.attach({ productId: currentGroupB.id })],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowBase.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: futureReplacementB.id }],
				},
			],
		});

		const productRows = await getCustomerProductRows({
			ctx,
			customerId,
			productIds: [nowBase.id, futureReplacementB.id],
		});

		expect(
			productRows.filter(
				(productRow) => productRow.productId === futureReplacementB.id,
			),
		).toEqual([
			{
				productId: futureReplacementB.id,
				status: CusProductStatus.Scheduled,
			},
		]);
		expect(
			productRows.filter(
				(productRow) =>
					productRow.productId === futureReplacementB.id &&
					productRow.status === CusProductStatus.Active,
			),
		).toHaveLength(0);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestInvoiceProductIds: [nowBase.id],
		});
		expect(customer.invoices?.[0]?.product_ids).not.toContain(
			futureReplacementB.id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: replacing a schedule removes old phases and leaves the correct replacement state in db")}`,
	async () => {
		const currentA = products.base({
			id: "create-schedule-replace-state-current-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const currentB = products.base({
			id: "create-schedule-replace-state-current-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: "group-b",
		});
		const currentAddon = products.recurringAddOn({
			id: "create-schedule-replace-state-current-addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const firstFutureA = products.pro({
			id: "create-schedule-replace-state-first-future-a",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const firstFutureAddon = products.recurringAddOn({
			id: "create-schedule-replace-state-first-future-addon",
			items: [items.monthlyWords({ includedUsage: 75 })],
		});
		const secondNowA = products.premium({
			id: "create-schedule-replace-state-second-now-a",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const secondFutureA = products.pro({
			id: "create-schedule-replace-state-second-future-a",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const secondFutureB = products.pro({
			id: "create-schedule-replace-state-second-future-b",
			items: [items.monthlyUsers({ includedUsage: 10 })],
			group: "group-b",
		});

		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "create-schedule-replace-state",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [
						currentA,
						currentB,
						currentAddon,
						firstFutureA,
						firstFutureAddon,
						secondNowA,
						secondFutureA,
						secondFutureB,
					],
				}),
			],
			actions: [
				s.billing.attach({ productId: currentA.id }),
				s.billing.attach({ productId: currentB.id }),
				s.billing.attach({ productId: currentAddon.id }),
			],
		});

		const now = advancedTo;
		const firstResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [
						{ plan_id: currentA.id },
						{ plan_id: currentB.id },
						{ plan_id: currentAddon.id },
					],
				},
				{
					starts_at: now + ms.days(15),
					plans: [
						{ plan_id: firstFutureA.id },
						{ plan_id: firstFutureAddon.id },
					],
				},
			],
		});

		const replacementNow = Date.now();
		const secondResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: replacementNow,
					plans: [{ plan_id: secondNowA.id }, { plan_id: currentAddon.id }],
				},
				{
					starts_at: replacementNow + ms.days(15),
					plans: [{ plan_id: secondFutureA.id }, { plan_id: secondFutureB.id }],
				},
			],
		});

		const dbSchedules = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.customer_id, customerId));
		expect(dbSchedules).toHaveLength(1);
		expect(dbSchedules[0]!.id).toBe(
			getRequiredScheduleId(secondResponse.schedule_id),
		);

		const firstSchedule = await ctx.db
			.select()
			.from(schedules)
			.where(
				eq(schedules.id, getRequiredScheduleId(firstResponse.schedule_id)),
			);
		expect(firstSchedule).toHaveLength(0);

		const secondSchedulePhases = await ctx.db
			.select()
			.from(schedulePhases)
			.where(
				eq(
					schedulePhases.schedule_id,
					getRequiredScheduleId(secondResponse.schedule_id),
				),
			);
		expect(secondSchedulePhases).toHaveLength(2);

		const firstSchedulePhases = await ctx.db
			.select()
			.from(schedulePhases)
			.where(
				eq(
					schedulePhases.schedule_id,
					getRequiredScheduleId(firstResponse.schedule_id),
				),
			);
		expect(firstSchedulePhases).toHaveLength(0);

		const productRowsAfterReplace = await getCustomerProductRows({
			ctx,
			customerId,
			productIds: [
				currentA.id,
				currentB.id,
				currentAddon.id,
				firstFutureA.id,
				firstFutureAddon.id,
				secondNowA.id,
				secondFutureA.id,
				secondFutureB.id,
			],
		});

		expect(
			productRowsAfterReplace
				.filter((productRow) => productRow.status === CusProductStatus.Active)
				.sort((a, b) => a.productId!.localeCompare(b.productId!)),
		).toEqual(
			[
				{ productId: currentAddon.id, status: CusProductStatus.Active },
				{ productId: secondNowA.id, status: CusProductStatus.Active },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);
		expect(
			productRowsAfterReplace
				.filter(
					(productRow) => productRow.status === CusProductStatus.Scheduled,
				)
				.sort((a, b) => a.productId!.localeCompare(b.productId!)),
		).toEqual(
			[
				{ productId: secondFutureA.id, status: CusProductStatus.Scheduled },
				{ productId: secondFutureB.id, status: CusProductStatus.Scheduled },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);
		expect(
			productRowsAfterReplace.filter(
				(productRow) =>
					productRow.productId === firstFutureA.id ||
					productRow.productId === firstFutureAddon.id,
			),
		).toHaveLength(0);

		const customerAfterReplace =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			customerAfterReplace.products
				?.map((product) => ({ id: product.id, status: product.status }))
				.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual(
			[
				{ id: currentAddon.id, status: "active" as const },
				{ id: secondFutureA.id, status: "scheduled" as const },
				{ id: secondFutureB.id, status: "scheduled" as const },
				{ id: secondNowA.id, status: "active" as const },
			].sort((a, b) => a.id.localeCompare(b.id)),
		);
	},
);
