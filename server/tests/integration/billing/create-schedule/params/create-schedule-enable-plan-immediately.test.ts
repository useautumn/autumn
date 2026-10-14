import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customers,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const parseCheckoutSessionId = (url: string): string | null => {
	const match = url.match(/\/c\/pay\/(cs_[^/?#]+)/);
	return match?.[1] ?? null;
};

test.concurrent(
	`${chalk.yellowBright("create-schedule enable_plan_immediately: pre-inserts both phases, webhook persists schedule")}`,
	async () => {
		const customerId = "create-schedule-eppi-happy";

		const pro = products.pro({
			id: "pro-eppi-cs",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const growth = products.pro({
			id: "growth-eppi-cs",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [pro, growth] }),
			],
			actions: [],
		});

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();
		const internalCustomerId = dbCustomer!.internal_id;

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			enable_plan_immediately: true,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: growth.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);

		expect(response.status).toBe("pending_payment");
		expect(response.schedule_id).toBeNull();
		expect(response.payment_url).toBeDefined();
		expect(response.payment_url).toContain("checkout.stripe.com");

		const checkoutSessionId = parseCheckoutSessionId(response.payment_url!);
		expect(checkoutSessionId).toBeTruthy();

		const cusProductsBefore = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});

		const proBefore = cusProductsBefore.find((cp) => cp.product.id === pro.id);
		const growthBefore = cusProductsBefore.find(
			(cp) => cp.product.id === growth.id,
		);
		expect(proBefore).toBeDefined();
		expect(growthBefore).toBeDefined();

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id],
			scheduled: [growth.id],
		});

		expect(proBefore!.stripe_checkout_session_id).toBe(checkoutSessionId);
		expect(growthBefore!.stripe_checkout_session_id).toBe(checkoutSessionId);

		expect(proBefore!.subscription_ids ?? []).toHaveLength(0);
		expect(growthBefore!.subscription_ids ?? []).toHaveLength(0);

		const schedulesBefore = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.internal_customer_id, internalCustomerId));
		expect(schedulesBefore).toHaveLength(0);

		await completeStripeCheckoutForm({ url: response.payment_url! });

		const cusProductsAfter = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		const proAfter = cusProductsAfter.find((cp) => cp.product.id === pro.id);
		const growthAfter = cusProductsAfter.find(
			(cp) => cp.product.id === growth.id,
		);
		expect(proAfter!.id).toBe(proBefore!.id);
		expect(proAfter!.subscription_ids ?? []).toHaveLength(1);

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [pro.id],
			scheduled: [growth.id],
		});

		const schedulesAfter = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.internal_customer_id, internalCustomerId));
		expect(schedulesAfter).toHaveLength(1);

		const phasesAfter = await ctx.db
			.select()
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, schedulesAfter[0]!.id));
		expect(phasesAfter).toHaveLength(2);

		expect(proAfter!.scheduled_ids ?? []).toHaveLength(1);
		expect(growthAfter!.scheduled_ids ?? []).toHaveLength(1);
		expect(proAfter!.scheduled_ids![0]).toBe(growthAfter!.scheduled_ids![0]);

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

// ═══════════════════════════════════════════════════════════════════════════════

// Skipped until the implementation lands — same reasoning as the attach Test 2.
test.skip(`${chalk.yellowBright("create-schedule enable_plan_immediately: expired session cleans up both phases")}`, async () => {
	const customerId = "create-schedule-eppi-expired";

	const pro = products.pro({
		id: "pro-eppi-cs-exp",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const growth = products.pro({
		id: "growth-eppi-cs-exp",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, growth] }),
		],
		actions: [],
	});

	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	const internalCustomerId = dbCustomer!.internal_id;

	const now = Date.now();
	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		enable_plan_immediately: true,
		phases: [
			{ starts_at: now, plans: [{ plan_id: pro.id }] },
			{ starts_at: now + ms.days(30), plans: [{ plan_id: growth.id }] },
		],
	});
	expect(response.payment_url).toBeDefined();

	const before = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
	});
	expect(before.length).toBeGreaterThanOrEqual(2);

	void TestFeature;

	const after = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
	});
	expect(
		after.some((cp) => cp.product.id === pro.id || cp.product.id === growth.id),
	).toBe(false);

	const schedulesAfter = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));
	expect(schedulesAfter).toHaveLength(0);
});
