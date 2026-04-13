import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	CustomerExpand,
	customerEntitlements,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

test.concurrent(`${chalk.yellowBright("create-schedule: bills the first phase immediately and stores later phases as scheduled")}`, async () => {
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
	expect(response.invoice?.total).toBe(40);
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

	const immediatePhaseCustomerProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			inArray(customerProducts.id, response.phases[0]!.customer_product_ids),
		);
	const phase1CustomerProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			inArray(customerProducts.id, response.phases[1]!.customer_product_ids),
		);

	expect(immediatePhaseCustomerProducts).toHaveLength(2);
	expect(
		immediatePhaseCustomerProducts.every(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		),
	).toBe(true);
	expect(phase1CustomerProducts).toHaveLength(1);
	expect(
		phase1CustomerProducts.every(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		),
	).toBe(true);
	expect(
		immediatePhaseCustomerProducts.filter(
			(customerProduct) => customerProduct.product_id === pro.id,
		),
	).toHaveLength(1);
	expect(
		immediatePhaseCustomerProducts.filter(
			(customerProduct) => customerProduct.product_id === addon.id,
		),
	).toHaveLength(1);
	expect(phase1CustomerProducts[0]!.product_id).toBe(pro.id);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});
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
	expect(dbSchedules[0]!.id).toBe(secondResponse.schedule_id);

	const removedScheduledProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, firstScheduledCustomerProductId));
	expect(removedScheduledProducts).toHaveLength(0);

	const removedSchedule = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.id, firstResponse.schedule_id));
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

test.concurrent(`${chalk.yellowBright("create-schedule: preserves customize.items on future scheduled customer products")}`, async () => {
	const base = products.base({
		id: "custom-future-base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-customize-future",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const now = Date.now();
	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: base.id }],
			},
			{
				starts_at: now + ms.days(30),
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

	const futurePhase = response.phases[1];
	expect(futurePhase).toBeDefined();

	const futureCustomerProductId = futurePhase?.customer_product_ids[0];
	expect(futureCustomerProductId).toBeTruthy();

	if (!futureCustomerProductId) {
		throw new Error(
			"Expected a scheduled customer product for the future phase",
		);
	}

	const insertedEntitlements = await ctx.db
		.select({
			feature_id: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.where(
			eq(customerEntitlements.customer_product_id, futureCustomerProductId),
		);

	expect(insertedEntitlements).toEqual([
		{
			feature_id: TestFeature.Words,
			balance: 250,
		},
	]);
});

test.concurrent(`${chalk.yellowBright("create-schedule: preserves the existing schedule when immediate billing is deferred")}`, async () => {
	const pro = products.pro({
		id: "deferred-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "deferred-premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-deferred",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const now = Date.now();
	const initialResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: pro.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: premium.id }],
			},
		],
	});

	const persistedCustomer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeCustomerId = persistedCustomer?.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(
			"Expected Stripe customer id before deferred create_schedule test",
		);
	}

	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId: stripeCustomerId,
		type: "authenticate",
	});

	await expectAutumnError({
		errMessage:
			"create_schedule does not support deferred immediate-phase billing yet",
		func: async () => {
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				phases: [
					{
						starts_at: Date.now(),
						plans: [{ plan_id: premium.id }],
					},
				],
			});
		},
	});

	const schedulesAfterDeferredAttempt = await ctx.db
		.select({
			id: schedules.id,
		})
		.from(schedules)
		.where(eq(schedules.customer_id, customerId));

	expect(schedulesAfterDeferredAttempt).toHaveLength(1);
	expect(schedulesAfterDeferredAttempt[0]!.id).toBe(
		initialResponse.schedule_id,
	);

	const phasesAfterDeferredAttempt = await ctx.db
		.select({
			id: schedulePhases.id,
			customer_product_ids: schedulePhases.customer_product_ids,
		})
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, initialResponse.schedule_id));

	expect(phasesAfterDeferredAttempt).toHaveLength(2);
	expect(
		phasesAfterDeferredAttempt.some(
			(phase) =>
				phase.customer_product_ids[0] ===
				initialResponse.phases[1]!.customer_product_ids[0],
		),
	).toBe(true);
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

	await expectAutumnError({
		errMessage: 'Unrecognized key: "free_trial"',
		func: async () => {
			await autumnV1.billing.createSchedule({
				customer_id: customerId,
				phases: [
					{
						starts_at: Date.now(),
						plans: [
							{
								plan_id: pro.id,
								customize: {
									free_trial: {
										duration_length: 7,
										duration_type: "day",
										card_required: false,
									},
								},
							},
						],
					},
				],
			});
		},
	});

	const { customerId: noPmCustomerId, autumnV1: autumnNoPm } =
		await initScenario({
			customerId: "create-schedule-no-pm",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

	await expectAutumnError({
		errMessage: "Please attach a payment method before creating a schedule.",
		func: async () => {
			await autumnNoPm.billing.createSchedule({
				customer_id: noPmCustomerId,
				phases: [
					{
						starts_at: Date.now(),
						plans: [{ plan_id: pro.id }],
					},
				],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule: internal get-customer returns schedule with phases")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-internal-get",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const now = Date.now();
	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: pro.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: premium.id }],
			},
		],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		expand: [CustomerExpand.Invoices],
	});

	// Fetch schedule from DB to attach (mirrors handleGetCustomer logic)
	const [existingSchedule] = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.internal_customer_id, fullCustomer.internal_id))
		.limit(1);

	expect(existingSchedule).toBeDefined();
	expect(existingSchedule!.id).toBe(response.schedule_id);

	const phases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, existingSchedule!.id));

	const schedule = { ...existingSchedule!, phases };

	// Verify the schedule shape matches what the internal endpoint returns
	expect(schedule.customer_id).toBe(customerId);
	expect(schedule.phases).toHaveLength(2);

	const immediatePhase = schedule.phases.find((p) => p.starts_at === now);
	const futurePhase = schedule.phases.find((p) => p.starts_at === now + ms.days(30));

	expect(immediatePhase).toBeDefined();
	expect(immediatePhase!.customer_product_ids).toHaveLength(1);

	expect(futurePhase).toBeDefined();
	expect(futurePhase!.customer_product_ids).toHaveLength(1);

	// Verify schedule is present on the fullCustomer when assigned
	const fullCustomerWithSchedule = { ...fullCustomer, schedule };
	expect(fullCustomerWithSchedule.schedule).toBeDefined();
	expect(fullCustomerWithSchedule.schedule!.phases).toHaveLength(2);
});
