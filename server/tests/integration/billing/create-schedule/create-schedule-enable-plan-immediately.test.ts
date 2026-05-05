/**
 * createSchedule + enable_plan_immediately + stripe_checkout
 *
 * Mirrors the attach test (`stripe-checkout-enable-plan-immediately.test.ts`)
 * for the createSchedule action:
 *
 * - At request time, immediate-phase cusProducts (Active) and scheduled-phase
 *   cusProducts (Scheduled) are pre-inserted, all linked to the pending Stripe
 *   checkout session via `stripe_checkout_session_id`.
 * - Autumn `schedules` + `schedule_phases` rows are NOT created at request time
 *   — they're persisted in the webhook handler on `checkout.session.completed`
 *   (via `persistDeferredCreateSchedule`).
 * - Response is `pending_payment` with `schedule_id: null` and a `payment_url`.
 * - On `checkout.session.expired`, all linked cusProducts are cleaned up.
 */

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
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Happy path
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create-schedule enable_plan_immediately: pre-inserts both phases, webhook persists schedule")}`, async () => {
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
			s.customer({ testClock: true }), // No payment method → stripe_checkout
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

	// Pre-completion: both cusProducts exist, linked to the same checkout session.
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

	expect(proBefore!.status).toBe(CusProductStatus.Active);
	expect(growthBefore!.status).toBe(CusProductStatus.Scheduled);

	expect(proBefore!.stripe_checkout_session_id).toBe(checkoutSessionId);
	expect(growthBefore!.stripe_checkout_session_id).toBe(checkoutSessionId);

	expect(proBefore!.subscription_ids ?? []).toHaveLength(0);
	expect(growthBefore!.subscription_ids ?? []).toHaveLength(0);

	// Pre-completion: no schedule rows yet.
	const schedulesBefore = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));
	expect(schedulesBefore).toHaveLength(0);

	// API view: pro is already active immediately.
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	// Customer completes checkout.
	await completeStripeCheckoutForm({ url: response.payment_url! });

	// Post-completion: subscription_ids patched on the immediate row,
	// schedule + phases rows now exist.
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
	expect(growthAfter!.status).toBe(CusProductStatus.Scheduled);

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

	// scheduled_ids should be populated on paid+recurring rows once the Stripe
	// subscription_schedule is created in the webhook.
	expect(proAfter!.scheduled_ids ?? []).toHaveLength(1);
	expect(growthAfter!.scheduled_ids ?? []).toHaveLength(1);
	expect(proAfter!.scheduled_ids![0]).toBe(growthAfter!.scheduled_ids![0]);

	// Cross-checks the Stripe subscription_schedule phases against the Autumn
	// cusProduct timeline.
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Abandoned session — both phases cleaned up; no schedule rows ever exist
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

	// TODO: drive past Stripe session expiry (24h) once the test harness
	// supports a clock-advance for checkout.session.expired.
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
