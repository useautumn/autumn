import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CheckoutAction,
	CusProductStatus,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import {
	confirmAutumnCheckout,
	fetchAutumnCheckout,
} from "@tests/integration/billing/utils/checkout/autumnCheckoutUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { isAutumnCheckoutUrl } from "@tests/integration/billing/utils/isAutumnCheckoutUrl";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";
import {
	getCheckoutId,
	getRequiredScheduleId,
} from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule: persists the new schedule and returns required_action when immediate billing is deferred")}`,
	async () => {
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
		expect(deferredResponse.schedule_id).toBeNull();
		expect(deferredResponse.phases).toEqual([]);
		expect(deferredResponse.status).toBe("pending_payment");

		const schedulesAfterDeferredAttempt = await ctx.db
			.select({
				id: schedules.id,
			})
			.from(schedules)
			.where(eq(schedules.customer_id, customerId));

		expect(schedulesAfterDeferredAttempt).toHaveLength(1);
		expect(schedulesAfterDeferredAttempt[0]!.id).toBe(
			getRequiredScheduleId(initialResponse.schedule_id),
		);

		const phasesAfterDeferredAttempt = await ctx.db
			.select({
				id: schedulePhases.id,
				customer_product_ids: schedulePhases.customer_product_ids,
			})
			.from(schedulePhases)
			.where(
				eq(
					schedulePhases.schedule_id,
					getRequiredScheduleId(initialResponse.schedule_id),
				),
			);

		expect(phasesAfterDeferredAttempt).toHaveLength(2);
		expect(phasesAfterDeferredAttempt[0]!.customer_product_ids).toEqual(
			initialResponse.phases[0]!.customer_product_ids,
		);
		expect(phasesAfterDeferredAttempt[1]!.customer_product_ids).toEqual(
			initialResponse.phases[1]!.customer_product_ids,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: no payment method returns Stripe checkout and activates after completion")}`,
	async () => {
		const pro = products.base({
			id: "create-schedule-checkout-pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-no-pm-checkout",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: Date.now(),
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		expect(response.status).toBe("pending_payment");
		expect(response.payment_url).toBeDefined();
		expect(isAutumnCheckoutUrl(response.payment_url!)).toBe(false);
		expect(response.schedule_id).toBeNull();
		expect(response.phases).toEqual([]);

		await completeStripeCheckoutForm({ url: response.payment_url! });
		await timeout(4000);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestStatus: "paid",
			latestTotal: 20,
		});

		const dbSchedules = await ctx.db
			.select({ id: schedules.id })
			.from(schedules)
			.where(eq(schedules.customer_id, customerId));

		expect(dbSchedules).toHaveLength(1);

		const phaseRows = await ctx.db
			.select({ customer_product_ids: schedulePhases.customer_product_ids })
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, dbSchedules[0]!.id));

		expect(phaseRows).toHaveLength(1);

		const persistedProducts = await ctx.db
			.select({
				productId: customerProducts.product_id,
				status: customerProducts.status,
			})
			.from(customerProducts)
			.where(inArray(customerProducts.id, phaseRows[0]!.customer_product_ids));

		expect(persistedProducts).toEqual([
			{
				productId: pro.id,
				status: CusProductStatus.Active,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: redirect_mode always returns Autumn checkout and confirms into a persisted schedule")}`,
	async () => {
		const starter = products.base({
			id: "create-schedule-autumn-starter",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});
		const premium = products.base({
			id: "create-schedule-autumn-premium",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-autumn-checkout",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, premium] }),
			],
			actions: [s.billing.attach({ productId: starter.id })],
		});

		const now = Date.now();
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			redirect_mode: "always",
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: premium.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: starter.id }],
				},
			],
		});

		expect(response.status).toBe("pending_payment");
		expect(response.schedule_id).toBeNull();
		expect(response.phases).toEqual([]);
		expect(isAutumnCheckoutUrl(response.payment_url!)).toBe(true);

		const checkoutId = getCheckoutId(response.payment_url);
		const checkout = await fetchAutumnCheckout({ checkoutId });

		expect(checkout.action).toBe(CheckoutAction.CreateSchedule);
		expect(checkout.preview.total).toBe(30);

		await confirmAutumnCheckout({
			checkoutId,
			customerId,
			productId: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(500);

		const dbSchedules = await ctx.db
			.select({ id: schedules.id })
			.from(schedules)
			.where(eq(schedules.customer_id, customerId));

		expect(dbSchedules).toHaveLength(1);

		const persistedPhases = await ctx.db
			.select({
				starts_at: schedulePhases.starts_at,
				customer_product_ids: schedulePhases.customer_product_ids,
			})
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, dbSchedules[0]!.id));

		expect(persistedPhases).toHaveLength(2);

		const immediateProducts = await ctx.db
			.select({
				productId: customerProducts.product_id,
				status: customerProducts.status,
			})
			.from(customerProducts)
			.where(
				inArray(customerProducts.id, persistedPhases[0]!.customer_product_ids),
			);
		const futureProducts = await ctx.db
			.select({
				productId: customerProducts.product_id,
				status: customerProducts.status,
			})
			.from(customerProducts)
			.where(
				inArray(customerProducts.id, persistedPhases[1]!.customer_product_ids),
			);

		expect(immediateProducts).toEqual([
			{
				productId: premium.id,
				status: CusProductStatus.Active,
			},
		]);
		expect(futureProducts).toEqual([
			{
				productId: starter.id,
				status: CusProductStatus.Scheduled,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: invoice mode can collect payment without an attached payment method")}`,
	async () => {
		const pro = products.base({
			id: "create-schedule-invoice-pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-invoice-no-pm",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			invoice_mode: {
				enabled: true,
				finalize: true,
				enable_plan_immediately: false,
			},
			phases: [
				{
					starts_at: Date.now(),
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		expect(response.status).toBe("pending_payment");
		expect(response.invoice?.status).toBe("open");
		expect(response.payment_url).toBeDefined();
		expect(response.schedule_id).toBeNull();
		expect(response.phases).toEqual([]);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		await expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 1,
			latestStatus: "open",
			latestTotal: 20,
		});

		await completeInvoiceCheckout({ url: response.payment_url! });
		await timeout(4000);

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 1,
			latestStatus: "paid",
			latestTotal: 20,
		});

		const dbSchedules = await ctx.db
			.select({ id: schedules.id })
			.from(schedules)
			.where(eq(schedules.customer_id, customerId));

		expect(dbSchedules).toHaveLength(1);

		const phaseRows = await ctx.db
			.select({ customer_product_ids: schedulePhases.customer_product_ids })
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, dbSchedules[0]!.id));

		expect(phaseRows).toHaveLength(1);

		const persistedProducts = await ctx.db
			.select({
				productId: customerProducts.product_id,
				status: customerProducts.status,
			})
			.from(customerProducts)
			.where(inArray(customerProducts.id, phaseRows[0]!.customer_product_ids));

		expect(persistedProducts).toEqual([
			{
				productId: pro.id,
				status: CusProductStatus.Active,
			},
		]);
	},
);
