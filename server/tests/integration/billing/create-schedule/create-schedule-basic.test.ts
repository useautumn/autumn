import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	CustomerExpand,
	customerEntitlements,
	customerPrices,
	customerProducts,
	ms,
	prices,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { hydrateCustomerWithSchedules } from "@/internal/customers/cusUtils/getFullCustomerSchedule";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

const getCustomerProductRows = async ({
	ctx,
	customerId,
	productIds,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productIds: string[];
}) =>
	await ctx.db
		.select({
			productId: customerProducts.product_id,
			status: customerProducts.status,
		})
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.customer_id, customerId),
				inArray(customerProducts.product_id, productIds),
			),
		);

const getCustomerProductPriceAmounts = async ({
	ctx,
	customerProductId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerProductId: string;
}) =>
	(
		await ctx.db
			.select({ config: prices.config })
			.from(customerPrices)
			.innerJoin(prices, eq(customerPrices.price_id, prices.id))
			.where(eq(customerPrices.customer_product_id, customerProductId))
	)
		.map((row) =>
			row.config && "amount" in row.config ? row.config.amount : undefined,
		)
		.filter((amount): amount is number => typeof amount === "number")
		.sort((a, b) => a - b);

const getCustomerProductEntitlementBalances = async ({
	ctx,
	customerProductId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerProductId: string;
}) =>
	await ctx.db
		.select({
			feature_id: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.where(eq(customerEntitlements.customer_product_id, customerProductId));

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

test.concurrent(`${chalk.yellowBright("create-schedule: customized future phases keep custom prices and entitlements through activation")}`, async () => {
	const base = products.base({
		id: "create-schedule-customize-rollover",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice(),
		],
	});

	const { customerId, autumnV1, ctx, testClockId, advancedTo } =
		await initScenario({
			customerId: "create-schedule-customize-rollover",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

	const now = advancedTo;
	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: base.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [
					{
						plan_id: base.id,
						customize: {
							price: itemsV2.monthlyPrice({ amount: 35 }),
							items: [
								itemsV2.monthlyWords({ included: 250 }),
								itemsV2.dashboard(),
							],
						},
					},
				],
			},
		],
	});

	const futureCustomerProductId = response.phases[1]!.customer_product_ids[0]!;

	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual([35]);
	expect(
		await getCustomerProductEntitlementBalances({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual(
		expect.arrayContaining([
			{ feature_id: TestFeature.Words, balance: 250 },
			{ feature_id: TestFeature.Dashboard, balance: null },
		]),
	);

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: now + ms.days(16),
		waitForSeconds: 30,
	});

	const activatedProduct = await ctx.db.query.customerProducts.findFirst({
		where: eq(customerProducts.id, futureCustomerProductId),
	});

	expect(activatedProduct?.status).toBe(CusProductStatus.Active);
	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual([35]);
	expect(
		await getCustomerProductEntitlementBalances({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual(
		expect.arrayContaining([
			{ feature_id: TestFeature.Words, balance: 250 },
			{ feature_id: TestFeature.Dashboard, balance: null },
		]),
	);
});

test.concurrent(`${chalk.yellowBright("create-schedule: updating a future customized phase replaces its custom prices and quantities before activation")}`, async () => {
	const base = products.base({
		id: "create-schedule-custom-update",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice(),
		],
	});

	const { customerId, autumnV1, ctx, testClockId, advancedTo } =
		await initScenario({
			customerId: "create-schedule-custom-update",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

	const now = advancedTo;
	const initialResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: base.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [
					{
						plan_id: base.id,
						customize: {
							price: itemsV2.monthlyPrice({ amount: 35 }),
							items: [
								itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 }),
							],
						},
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								quantity: 200,
							},
						],
					},
				],
			},
		],
	});

	const initialFutureCustomerProductId =
		initialResponse.phases[1]!.customer_product_ids[0]!;

	const updatedResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: base.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [
					{
						plan_id: base.id,
						customize: {
							price: itemsV2.monthlyPrice({ amount: 55 }),
							items: [
								itemsV2.prepaidMessages({ amount: 20, billingUnits: 100 }),
							],
						},
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								quantity: 500,
							},
						],
					},
				],
			},
		],
	});

	const updatedFutureCustomerProductId =
		updatedResponse.phases[1]!.customer_product_ids[0]!;

	expect(updatedFutureCustomerProductId).not.toBe(
		initialFutureCustomerProductId,
	);
	expect(
		await ctx.db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, initialFutureCustomerProductId),
		}),
	).toBeNull();

	const updatedFutureCustomerProduct =
		await ctx.db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, updatedFutureCustomerProductId),
		});

	expect(updatedFutureCustomerProduct?.status).toBe(CusProductStatus.Scheduled);
	expect(updatedFutureCustomerProduct?.options).toEqual([
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			quantity: 5,
		}),
	]);
	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: updatedFutureCustomerProductId,
		}),
	).toEqual([20, 55]);

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: now + ms.days(16),
		waitForSeconds: 30,
	});

	const activatedFutureCustomerProduct =
		await ctx.db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, updatedFutureCustomerProductId),
		});

	expect(activatedFutureCustomerProduct?.status).toBe(CusProductStatus.Active);
	expect(activatedFutureCustomerProduct?.options).toEqual([
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			quantity: 5,
		}),
	]);
	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: updatedFutureCustomerProductId,
		}),
	).toEqual([20, 55]);
});

test.concurrent(`${chalk.yellowBright("create-schedule: persists the new schedule and returns required_action when immediate billing is deferred")}`, async () => {
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

	const deferredResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: Date.now(),
				plans: [{ plan_id: premium.id }],
			},
		],
	});

	expect(deferredResponse.required_action).toBeDefined();
	expect(deferredResponse.required_action?.code).toBe("3ds_required");
	expect(deferredResponse.payment_url).toBeDefined();
	expect(deferredResponse.schedule_id).not.toBe(initialResponse.schedule_id);
	expect(deferredResponse.phases).toHaveLength(1);

	const schedulesAfterDeferredAttempt = await ctx.db
		.select({
			id: schedules.id,
		})
		.from(schedules)
		.where(eq(schedules.customer_id, customerId));

	expect(schedulesAfterDeferredAttempt).toHaveLength(1);
	expect(schedulesAfterDeferredAttempt[0]!.id).toBe(
		deferredResponse.schedule_id,
	);

	const phasesAfterDeferredAttempt = await ctx.db
		.select({
			id: schedulePhases.id,
			customer_product_ids: schedulePhases.customer_product_ids,
		})
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, deferredResponse.schedule_id));

	expect(phasesAfterDeferredAttempt).toHaveLength(1);
	expect(phasesAfterDeferredAttempt[0]!.customer_product_ids).toEqual(
		deferredResponse.phases[0]!.customer_product_ids,
	);
});

test.concurrent(`${chalk.yellowBright("create-schedule: allows multiple group replacements when they only conflict with current plans")}`, async () => {
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
});

test.concurrent(`${chalk.yellowBright("create-schedule: later-phase-only plans stay scheduled and never hit immediate billing")}`, async () => {
	const nowBase = products.pro({
		id: "create-schedule-now-base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const nowAddon = products.recurringAddOn({
		id: "create-schedule-now-addon",
		items: [items.monthlyWords({ includedUsage: 50 })],
	});
	const futureGroupB = products.base({
		id: "create-schedule-future-group-b",
		items: [items.monthlyUsers({ includedUsage: 5 }), items.monthlyPrice()],
		group: "group-b",
	});
	const futureGroupC = products.base({
		id: "create-schedule-future-group-c",
		items: [
			items.monthlyMessages({ includedUsage: 250 }),
			items.monthlyPrice(),
		],
		group: "group-c",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-future-only-not-now",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [nowBase, nowAddon, futureGroupB, futureGroupC],
			}),
		],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: nowBase.id }, { plan_id: nowAddon.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [{ plan_id: futureGroupB.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: futureGroupC.id }],
			},
		],
	});

	const productRows = await getCustomerProductRows({
		ctx,
		customerId,
		productIds: [nowBase.id, nowAddon.id, futureGroupB.id, futureGroupC.id],
	});
	const activeRows = productRows
		.filter((productRow) => productRow.status === CusProductStatus.Active)
		.sort((a, b) => a.productId!.localeCompare(b.productId!));
	const scheduledRows = productRows
		.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
		.sort((a, b) => a.productId!.localeCompare(b.productId!));

	expect(activeRows).toEqual(
		[
			{ productId: nowBase.id, status: CusProductStatus.Active },
			{ productId: nowAddon.id, status: CusProductStatus.Active },
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);
	expect(scheduledRows).toEqual(
		[
			{ productId: futureGroupB.id, status: CusProductStatus.Scheduled },
			{ productId: futureGroupC.id, status: CusProductStatus.Scheduled },
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestInvoiceProductIds: [nowBase.id, nowAddon.id],
	});
	expect(customer.invoices?.[0]?.product_ids).not.toContain(futureGroupB.id);
	expect(customer.invoices?.[0]?.product_ids).not.toContain(futureGroupC.id);
});

test.concurrent(`${chalk.yellowBright("create-schedule: future replacements for an active group stay scheduled until their phase")}`, async () => {
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
});

test.concurrent(`${chalk.yellowBright("create-schedule: now phase stays the exact active set across groups and future phases")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const wordsItem = items.monthlyWords({ includedUsage: 25 });

	const currentA = products.base({
		id: "create-schedule-exact-current-a",
		items: [messagesItem, items.monthlyPrice({ price: 5 })],
	});
	const keepNowB = products.base({
		id: "create-schedule-exact-keep-b",
		items: [usersItem, items.monthlyPrice({ price: 5 })],
		group: "group-b",
	});
	const currentAddon = products.recurringAddOn({
		id: "create-schedule-exact-current-addon",
		items: [wordsItem],
	});
	const nowReplacementA = products.pro({
		id: "create-schedule-exact-now-a",
		items: [messagesItem],
	});
	const futureReplacementB = products.base({
		id: "create-schedule-exact-future-b",
		items: [usersItem, items.monthlyPrice({ price: 15 })],
		group: "group-b",
	});
	const futureAddon = products.recurringAddOn({
		id: "create-schedule-exact-future-addon",
		items: [wordsItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-exact-now-set",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [
					currentA,
					keepNowB,
					currentAddon,
					nowReplacementA,
					futureReplacementB,
					futureAddon,
				],
			}),
		],
		actions: [
			s.billing.attach({ productId: currentA.id }),
			s.billing.attach({ productId: keepNowB.id }),
			s.billing.attach({ productId: currentAddon.id }),
		],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: nowReplacementA.id }, { plan_id: keepNowB.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [
					{ plan_id: futureReplacementB.id },
					{ plan_id: futureAddon.id },
				],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: currentA.id }],
			},
		],
	});

	const productRows = await getCustomerProductRows({
		ctx,
		customerId,
		productIds: [
			currentA.id,
			keepNowB.id,
			currentAddon.id,
			nowReplacementA.id,
			futureReplacementB.id,
			futureAddon.id,
		],
	});
	const activeRows = productRows
		.filter((productRow) => productRow.status === CusProductStatus.Active)
		.sort((a, b) => a.productId!.localeCompare(b.productId!));
	const scheduledRows = productRows
		.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
		.sort((a, b) => a.productId!.localeCompare(b.productId!));

	expect(activeRows).toEqual(
		[
			{ productId: keepNowB.id, status: CusProductStatus.Active },
			{ productId: nowReplacementA.id, status: CusProductStatus.Active },
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);
	expect(scheduledRows).toEqual(
		[
			{ productId: currentA.id, status: CusProductStatus.Scheduled },
			{ productId: futureAddon.id, status: CusProductStatus.Scheduled },
			{
				productId: futureReplacementB.id,
				status: CusProductStatus.Scheduled,
			},
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.invoices?.[0]?.product_ids).not.toContain(
		futureReplacementB.id,
	);
	expect(customer.invoices?.[0]?.product_ids).not.toContain(futureAddon.id);
});

test.concurrent(`${chalk.yellowBright("create-schedule: plans omitted from the next phase end at the phase boundary")}`, async () => {
	const nowBase = products.pro({
		id: "create-schedule-phase-end-now-base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const nowAddon = products.recurringAddOn({
		id: "create-schedule-phase-end-now-addon",
		items: [items.monthlyWords({ includedUsage: 25 })],
	});
	const nextBase = products.premium({
		id: "create-schedule-phase-end-next-base",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const nextAddon = products.recurringAddOn({
		id: "create-schedule-phase-end-next-addon",
		items: [items.monthlyWords({ includedUsage: 75 })],
	});

	const { customerId, autumnV1, ctx, testClockId, advancedTo } =
		await initScenario({
			customerId: "create-schedule-phase-end-boundary",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [nowBase, nowAddon, nextBase, nextAddon] }),
			],
			actions: [],
		});

	const now = advancedTo;
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: nowBase.id }, { plan_id: nowAddon.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [{ plan_id: nextBase.id }, { plan_id: nextAddon.id }],
			},
		],
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: now + ms.days(16),
		waitForSeconds: 30,
	});

	const productRows = await getCustomerProductRows({
		ctx,
		customerId,
		productIds: [nowBase.id, nowAddon.id, nextBase.id, nextAddon.id],
	});

	expect(
		productRows
			.filter((productRow) => productRow.status === CusProductStatus.Active)
			.sort((a, b) => a.productId!.localeCompare(b.productId!)),
	).toEqual(
		[
			{ productId: nextAddon.id, status: CusProductStatus.Active },
			{ productId: nextBase.id, status: CusProductStatus.Active },
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);
	expect(
		productRows.filter(
			(productRow) => productRow.status === CusProductStatus.Scheduled,
		),
	).toHaveLength(0);
	expect(
		productRows
			.filter((productRow) => productRow.status === CusProductStatus.Expired)
			.sort((a, b) => a.productId!.localeCompare(b.productId!)),
	).toEqual(
		[
			{ productId: nowAddon.id, status: CusProductStatus.Expired },
			{ productId: nowBase.id, status: CusProductStatus.Expired },
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.products?.map((product) => product.id).sort()).toEqual(
		[nextAddon.id, nextBase.id].sort(),
	);
});

test.concurrent(`${chalk.yellowBright("create-schedule: updating a schedule after earlier phases started preserves history and edits the current phase")}`, async () => {
	const originalPastBase = products.base({
		id: "create-schedule-update-history-past-base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const currentBase = products.base({
		id: "create-schedule-update-history-current-base",
		items: [items.monthlyMessages({ includedUsage: 300 })],
		group: "current-base",
	});
	const currentAddon = products.recurringAddOn({
		id: "create-schedule-update-history-current-addon",
		items: [items.monthlyWords({ includedUsage: 25 })],
	});
	const futureBase = products.base({
		id: "create-schedule-update-history-future-base",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		group: "current-base",
	});

	const { customerId, autumnV1, ctx, testClockId, advancedTo } =
		await initScenario({
			customerId: "create-schedule-update-history",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [originalPastBase, currentBase, currentAddon, futureBase],
				}),
			],
			actions: [],
		});

	const now = advancedTo;
	const initialResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: originalPastBase.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [{ plan_id: currentBase.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: futureBase.id }],
			},
		],
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: now + ms.days(16),
		waitForSeconds: 30,
	});

	const updatedResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: originalPastBase.id }],
			},
			{
				starts_at: now + ms.days(15),
				plans: [{ plan_id: currentBase.id }, { plan_id: currentAddon.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: futureBase.id }],
			},
		],
	});

	expect(updatedResponse.phases.map((phase) => phase.starts_at)).toEqual([
		now,
		now + ms.days(15),
		now + ms.days(30),
	]);
	expect(updatedResponse.phases[0]!.customer_product_ids).toEqual(
		initialResponse.phases[0]!.customer_product_ids,
	);
	expect(updatedResponse.phases[1]!.customer_product_ids).toHaveLength(2);

	const updatedSchedulePhases = await ctx.db
		.select({
			starts_at: schedulePhases.starts_at,
			customer_product_ids: schedulePhases.customer_product_ids,
		})
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, updatedResponse.schedule_id));

	expect(updatedSchedulePhases.map((phase) => phase.starts_at)).toEqual([
		now,
		now + ms.days(15),
		now + ms.days(30),
	]);
	expect(updatedSchedulePhases[0]!.customer_product_ids).toEqual(
		initialResponse.phases[0]!.customer_product_ids,
	);

	const currentPhaseProducts = await ctx.db
		.select({
			productId: customerProducts.product_id,
			status: customerProducts.status,
		})
		.from(customerProducts)
		.where(
			inArray(
				customerProducts.id,
				updatedResponse.phases[1]!.customer_product_ids,
			),
		);

	expect(
		currentPhaseProducts.sort((a, b) =>
			a.productId!.localeCompare(b.productId!),
		),
	).toEqual(
		[
			{ productId: currentAddon.id, status: CusProductStatus.Active },
			{ productId: currentBase.id, status: CusProductStatus.Active },
		].sort((a, b) => a.productId.localeCompare(b.productId)),
	);
});

test.concurrent(`${chalk.yellowBright("create-schedule: replacing a schedule removes old phases and leaves the correct replacement state in db")}`, async () => {
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
				plans: [{ plan_id: firstFutureA.id }, { plan_id: firstFutureAddon.id }],
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
	expect(dbSchedules[0]!.id).toBe(secondResponse.schedule_id);

	const firstSchedule = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.id, firstResponse.schedule_id));
	expect(firstSchedule).toHaveLength(0);

	const secondSchedulePhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, secondResponse.schedule_id));
	expect(secondSchedulePhases).toHaveLength(2);

	const firstSchedulePhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, firstResponse.schedule_id));
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
			.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
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

test.concurrent(`${chalk.yellowBright("create-schedule: hydrates schedules on the full customer")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-hydrate-customer",
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
		expand: [],
	});
	const hydratedCustomer = await hydrateCustomerWithSchedules({
		ctx,
		fullCustomer,
	});

	expect(hydratedCustomer.schedule?.id).toBe(response.schedule_id);
	expect(hydratedCustomer.schedule?.customer_id).toBe(customerId);
	expect(hydratedCustomer.schedule?.phases).toHaveLength(2);
	expect(hydratedCustomer.schedule?.phases[0]?.starts_at).toBe(now);
expect(hydratedCustomer.schedule?.phases[1]?.starts_at).toBe(
	now + ms.days(30),
);
});

test.concurrent(`${chalk.yellowBright("create-schedule: adding a future phase to an existing single-phase schedule persists both phases")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-add-future-phase",
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
		],
	});

	expect(initialResponse.phases).toHaveLength(1);
	expect(initialResponse.phases[0]!.customer_product_ids).toHaveLength(1);

	const initialDbPhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, initialResponse.schedule_id));
	expect(initialDbPhases).toHaveLength(1);

	const updatedResponse = await autumnV1.billing.createSchedule({
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

	expect(updatedResponse.phases).toHaveLength(2);
	expect(updatedResponse.phases[0]!.starts_at).toBe(now);
	expect(updatedResponse.phases[0]!.customer_product_ids).toHaveLength(1);
	expect(updatedResponse.phases[1]!.starts_at).toBe(now + ms.days(30));
	expect(updatedResponse.phases[1]!.customer_product_ids).toHaveLength(1);

	const updatedDbPhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, updatedResponse.schedule_id));
	expect(updatedDbPhases).toHaveLength(2);

	const immediateProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			inArray(
				customerProducts.id,
				updatedResponse.phases[0]!.customer_product_ids,
			),
		);
	expect(immediateProducts).toHaveLength(1);
	expect(immediateProducts[0]!.status).toBe(CusProductStatus.Active);

	const futureProducts = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			inArray(
				customerProducts.id,
				updatedResponse.phases[1]!.customer_product_ids,
			),
		);
	expect(futureProducts).toHaveLength(1);
	expect(futureProducts[0]!.status).toBe(CusProductStatus.Scheduled);
	expect(futureProducts[0]!.product_id).toBe(premium.id);
});

test.concurrent(`${chalk.yellowBright("create-schedule: updating a schedule with customized future phase persists both phases and custom items")}`, async () => {
	const base = products.base({
		id: "base",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice(),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-update-with-customize",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const now = Date.now();
	const initialResponse = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: base.id }],
			},
		],
	});

	expect(initialResponse.phases).toHaveLength(1);

	const updatedResponse = await autumnV1.billing.createSchedule({
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
							price: itemsV2.monthlyPrice({ amount: 50 }),
							items: [itemsV2.monthlyWords({ included: 200 })],
						},
					},
				],
			},
		],
	});

	expect(updatedResponse.phases).toHaveLength(2);

	const updatedDbPhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, updatedResponse.schedule_id));
	expect(updatedDbPhases).toHaveLength(2);

	const futureCustomerProductId =
		updatedResponse.phases[1]!.customer_product_ids[0]!;

	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual([50]);

	expect(
		await getCustomerProductEntitlementBalances({
			ctx,
			customerProductId: futureCustomerProductId,
		}),
	).toEqual(
		expect.arrayContaining([{ feature_id: TestFeature.Words, balance: 200 }]),
	);
});

test.concurrent(`${chalk.yellowBright("create-schedule: customize with boolean feature persists the boolean entitlement")}`, async () => {
	const base = products.base({
		id: "bool-base",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice(),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "create-schedule-customize-boolean",
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
							items: [
								itemsV2.monthlyMessages({ included: 100 }),
								itemsV2.dashboard(),
							],
						},
					},
				],
			},
		],
	});

	const customerProductId = response.phases[0]!.customer_product_ids[0]!;

	const entitlementBalances = await getCustomerProductEntitlementBalances({
		ctx,
		customerProductId,
	});

	expect(entitlementBalances).toEqual(
		expect.arrayContaining([
			{ feature_id: TestFeature.Messages, balance: 100 },
			{ feature_id: TestFeature.Dashboard, balance: 0 },
		]),
	);

	const customerProduct = await ctx.db.query.customerProducts.findFirst({
		where: eq(customerProducts.id, customerProductId),
	});
	expect(customerProduct?.is_custom).toBe(true);
});

test.concurrent(`${chalk.yellowBright("create-schedule: customer-level and entity-level schedules coexist independently")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyWords({ includedUsage: 25 })],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "create-schedule-entity-coexist",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0]!.id;
	const now = Date.now();

	const customerSchedule = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: pro.id }],
			},
		],
	});

	const entitySchedule = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		entity_id: entityId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: addon.id }],
			},
		],
	});

	expect(customerSchedule.schedule_id).not.toBe(entitySchedule.schedule_id);

	const dbSchedules = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.customer_id, customerId));
	expect(dbSchedules).toHaveLength(2);

	const customerLevelSchedule = dbSchedules.find((s) => !s.internal_entity_id);
	const entityLevelSchedule = dbSchedules.find((s) => !!s.internal_entity_id);
expect(customerLevelSchedule).toBeDefined();
expect(entityLevelSchedule).toBeDefined();
expect(entityLevelSchedule!.entity_id).toBe(entityId);
});
