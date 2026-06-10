import { expect, test } from "bun:test";
import {
	BillingMethod,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	ms,
	schedulePhases,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import {
	getCustomerProductEntitlementBalances,
	getCustomerProductFeaturePriceAmounts,
	getCustomerProductPriceAmounts,
	getRequiredScheduleId,
} from "../utils/createScheduleTestHelpers";

// Contract: V2.2 schedule customize accepts PATCH-style add_items/remove_items.
// Contract: patched items/prices apply to immediate and future cusProducts, including Stripe.

test.concurrent(
	`${chalk.yellowBright("create-schedule: preserves feature quantity options on created customer products")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: patch customize applies to immediate customer products and Stripe")}`,
	async () => {
		const base = products.base({
			id: "create-schedule-patch-immediate",
			items: [
				items.monthlyPrice(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 50 }),
			],
		});

		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "create-schedule-patch-immediate",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

		const response = await autumnV2_2.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: Date.now(),
					plans: [
						{
							plan_id: base.id,
							customize: {
								price: itemsV2.monthlyPrice({ amount: 42 }),
								remove_items: [{ feature_id: TestFeature.Messages }],
								add_items: [itemsV2.dashboard()],
							},
						},
					],
				},
			],
		});

		const customerProductId = response.phases[0]!.customer_product_ids[0]!;
		const customerProduct = await ctx.db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, customerProductId),
		});

		expect(customerProduct?.is_custom).toBe(true);
		expect(
			await getCustomerProductPriceAmounts({ ctx, customerProductId }),
		).toEqual([42]);
		expect(
			await getCustomerProductEntitlementBalances({
				ctx,
				customerProductId,
			}),
		).toEqual(
			expect.arrayContaining([
				{ feature_id: TestFeature.Words, balance: 50 },
				{ feature_id: TestFeature.Dashboard, balance: 0 },
			]),
		);
		expect(
			await getCustomerProductEntitlementBalances({
				ctx,
				customerProductId,
			}),
		).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature_id: TestFeature.Messages }),
			]),
		);

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: patch customize applies to future customer products and Stripe schedule")}`,
	async () => {
		const base = products.base({
			id: "create-schedule-patch-future",
			items: [
				items.monthlyPrice(),
				items.monthlyMessages({ includedUsage: 100 }),
				items.prepaid({
					featureId: TestFeature.Words,
					price: 10,
					billingUnits: 100,
				}),
			],
		});

		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "create-schedule-patch-future",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

		const now = Date.now();
		const response = await autumnV2_2.billing.createSchedule({
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
								remove_items: [
									{
										feature_id: TestFeature.Words,
										billing_method: BillingMethod.Prepaid,
									},
								],
								add_items: [
									itemsV2.prepaidWords({ amount: 7, billingUnits: 100 }),
								],
							},
							feature_quantities: [
								{
									feature_id: TestFeature.Words,
									quantity: 300,
								},
							],
						},
					],
				},
			],
		});

		const futureCustomerProductId =
			response.phases[1]!.customer_product_ids[0]!;
		const futureCustomerProduct = await ctx.db.query.customerProducts.findFirst(
			{
				where: eq(customerProducts.id, futureCustomerProductId),
			},
		);

		expect(futureCustomerProduct?.is_custom).toBe(true);
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerProductId: futureCustomerProductId,
			}),
		).toEqual([20]);
		expect(
			await getCustomerProductFeaturePriceAmounts({
				ctx,
				customerProductId: futureCustomerProductId,
				featureId: TestFeature.Words,
			}),
		).toEqual([7]);
		expect(
			await getCustomerProductEntitlementBalances({
				ctx,
				customerProductId: futureCustomerProductId,
			}),
		).toEqual(
			expect.arrayContaining([
				{ feature_id: TestFeature.Messages, balance: 100 },
				{ feature_id: TestFeature.Words, balance: 300 },
			]),
		);

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: preserves customize.items on created customer products")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: preserves customize.items on future scheduled customer products")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: customized future phases keep custom prices and entitlements through activation")}`,
	async () => {
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

		const futureCustomerProductId =
			response.phases[1]!.customer_product_ids[0]!;

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
				{ feature_id: TestFeature.Dashboard, balance: 0 },
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
				{ feature_id: TestFeature.Dashboard, balance: 0 },
			]),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: updating a future customized phase replaces its custom prices and quantities before activation")}`,
	async () => {
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
		).toBeUndefined();

		const updatedFutureCustomerProduct =
			await ctx.db.query.customerProducts.findFirst({
				where: eq(customerProducts.id, updatedFutureCustomerProductId),
			});

		expect(updatedFutureCustomerProduct?.status).toBe(
			CusProductStatus.Scheduled,
		);
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
		).toEqual([55]);

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

		expect(activatedFutureCustomerProduct?.status).toBe(
			CusProductStatus.Active,
		);
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
		).toEqual([55]);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: updating a schedule with customized future phase persists both phases and custom items")}`,
	async () => {
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
			.where(
				eq(
					schedulePhases.schedule_id,
					getRequiredScheduleId(updatedResponse.schedule_id),
				),
			);
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
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: customize with boolean feature persists the boolean entitlement")}`,
	async () => {
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
	},
);
