// Contract — API/UI input: create_schedule accepts long_lived_checkout and returns a reusable /co/ URL.
// Starting that URL creates a Stripe checkout and enables the immediate and scheduled products once.

// Contract — expiry/retry: an expired child session preserves products and balances.
// Reopening the same /co/ URL rotates the Stripe session without duplicating Autumn state.

// Contract — completion/regression: the replacement session materializes one schedule.
// A normal checkout session still expires its enable-plan-immediately products.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CheckoutStatus,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customers,
	ms,
	schedules,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { handleStripeCheckoutSessionCompleted } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/handleStripeCheckoutSessionCompleted";
import { handleStripeCheckoutSessionExpired } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionExpired/handleStripeCheckoutSessionExpired";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const CHECKOUT_BASE_URL =
	process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080";
const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

const getLongLivedCheckoutId = (paymentUrl: string | null | undefined) => {
	const checkoutId = paymentUrl?.split("/co/")[1];
	if (!checkoutId)
		throw new Error(`Expected long-lived checkout URL: ${paymentUrl}`);
	return checkoutId;
};

const getStripeSessionId = (url: string) => {
	const sessionId = url.match(STRIPE_SESSION_ID_REGEX)?.[0];
	if (!sessionId) throw new Error(`Expected Stripe checkout URL: ${url}`);
	return sessionId;
};

const requestLongLivedCheckout = async (checkoutId: string) =>
	await fetch(`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/start`, {
		redirect: "manual",
	});

const startLongLivedCheckout = async (checkoutId: string) => {
	const response = await requestLongLivedCheckout(checkoutId);
	expect(response.status).toBe(303);
	const location = response.headers.get("location");
	expect(location).toContain("checkout.stripe.com");
	return location!;
};

const expireCheckoutSession = async ({
	ctx,
	sessionId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	sessionId: string;
}) => {
	const session = await ctx.stripeCli.checkout.sessions.expire(sessionId);
	const event = {
		id: `evt_expired_${sessionId}`,
		type: "checkout.session.expired",
		data: { object: session },
	} as unknown as Stripe.CheckoutSessionExpiredEvent;

	await handleStripeCheckoutSessionExpired({
		ctx: {
			...ctx,
			stripeCli: ctx.stripeCli,
			stripeEvent: event,
		} as StripeWebhookContext,
		event,
	});
};

const completeCheckoutSessionWebhook = async ({
	ctx,
	sessionId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	sessionId: string;
}) => {
	const session = await ctx.stripeCli.checkout.sessions.retrieve(sessionId);
	const event = {
		id: `evt_completed_${sessionId}`,
		type: "checkout.session.completed",
		data: { object: session },
	} as unknown as Stripe.CheckoutSessionCompletedEvent;

	await handleStripeCheckoutSessionCompleted({
		ctx: {
			...ctx,
			stripeCli: ctx.stripeCli,
			stripeEvent: event,
		} as StripeWebhookContext,
		event,
	});
};

test.concurrent(
	`${chalk.yellowBright("create-schedule long-lived checkout: preserves and rebinds enabled products across child expiry")}`,
	async () => {
		const customerId = `cs-long-lived-${crypto.randomUUID().slice(0, 8)}`;
		const immediate = products.pro({
			id: "immediate-enterprise-long-lived",
			items: [items.monthlyMessages({ includedUsage: 10_000 })],
		});
		const future = products.pro({
			id: "future-enterprise-long-lived",
			items: [items.monthlyMessages({ includedUsage: 5_000 })],
		});
		const { autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [immediate, future] }),
			],
			actions: [],
		});
		const customer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const startsAt = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			billing_behavior: "none",
			enable_plan_immediately: true,
			long_lived_checkout: true,
			phases: [
				{ starts_at: startsAt, plans: [{ plan_id: immediate.id }] },
				{
					starts_at: startsAt + ms.days(30),
					plans: [{ plan_id: future.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("pending_payment");
		expect(response.payment_url).toContain("/co/");
		expect(response.payment_url).not.toContain("checkout.stripe.com");

		const productsBeforeOpen = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		expect(productsBeforeOpen).toHaveLength(2);
		expect(productsBeforeOpen).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					status: CusProductStatus.Active,
					product: expect.objectContaining({ id: immediate.id }),
				}),
				expect.objectContaining({
					status: CusProductStatus.Scheduled,
					product: expect.objectContaining({ id: future.id }),
				}),
			]),
		);

		const checkoutId = getLongLivedCheckoutId(response.payment_url);
		const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
		expect(checkout?.expires_at).toBe(checkout!.created_at + ms.days(90));

		const firstStripeUrl = await startLongLivedCheckout(checkoutId);
		const firstSessionId = getStripeSessionId(firstStripeUrl);
		const productsBeforeExpiry = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		expect(productsBeforeExpiry).toEqual(productsBeforeOpen);
		for (const product of productsBeforeExpiry) {
			expect(product.stripe_checkout_session_id).toBe(firstSessionId);
		}

		const customerBeforeExpiry =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerBeforeExpiry,
			featureId: TestFeature.Messages,
			remaining: 10_000,
		});

		await expireCheckoutSession({ ctx, sessionId: firstSessionId });

		const productsAfterExpiry = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		for (const product of productsBeforeExpiry) {
			expect(productsAfterExpiry).toContainEqual(
				expect.objectContaining({ id: product.id }),
			);
		}
		const customerAfterExpiry =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterExpiry,
			featureId: TestFeature.Messages,
			remaining: 10_000,
		});

		const rotationResponses = await Promise.all([
			requestLongLivedCheckout(checkoutId),
			requestLongLivedCheckout(checkoutId),
		]);
		expect(
			rotationResponses.every(({ status }) => status === 303 || status === 423),
		).toBe(true);
		const replacementLocations = rotationResponses
			.filter(({ status }) => status === 303)
			.map((rotationResponse) => rotationResponse.headers.get("location")!);
		expect(new Set(replacementLocations).size).toBe(1);
		const replacementStripeUrl = replacementLocations[0]!;
		const replacementSessionId = getStripeSessionId(replacementStripeUrl);
		expect(replacementSessionId).not.toBe(firstSessionId);

		const reboundProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		expect(reboundProducts).toHaveLength(2);
		expect(
			reboundProducts.every(
				(product) =>
					product.stripe_checkout_session_id === replacementSessionId,
			),
		).toBe(true);

		await completeStripeCheckoutForm({ url: replacementStripeUrl });
		await completeCheckoutSessionWebhook({
			ctx,
			sessionId: replacementSessionId,
		});

		const createdSchedules = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.internal_customer_id, customer!.internal_id));
		expect(createdSchedules).toHaveLength(1);

		const completedProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		expect(completedProducts).toHaveLength(2);
		expect(completedProducts[0]?.subscription_ids).not.toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule long-lived checkout: parent expiry rolls back enabled products")}`,
	async () => {
		const customerId = `cs-parent-expiry-${crypto.randomUUID().slice(0, 8)}`;
		const immediate = products.pro({
			id: "create-schedule-parent-expiry-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const future = products.pro({
			id: "create-schedule-parent-expiry-growth",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [immediate, future] }),
			],
			actions: [],
		});
		const customer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			enable_plan_immediately: true,
			long_lived_checkout: true,
			phases: [
				{ starts_at: Date.now(), plans: [{ plan_id: immediate.id }] },
				{
					starts_at: Date.now() + ms.days(30),
					plans: [{ plan_id: future.id }],
				},
			],
		});
		const checkoutId = getLongLivedCheckoutId(response.payment_url);
		const stripeUrl = await startLongLivedCheckout(checkoutId);

		await checkoutRepo.update({
			db: ctx.db,
			id: checkoutId,
			updates: {
				status: CheckoutStatus.Expired,
				expires_at: Date.now() - 1,
			},
		});
		await expireCheckoutSession({
			ctx,
			sessionId: getStripeSessionId(stripeUrl),
		});

		const productsAfterExpiry = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		expect(productsAfterExpiry).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule normal checkout: expired child still rolls back enabled products")}`,
	async () => {
		const customerId = `cs-normal-expiry-${crypto.randomUUID().slice(0, 8)}`;
		const pro = products.pro({
			id: "create-schedule-normal-expiry-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const growth = products.pro({
			id: "create-schedule-normal-expiry-growth",
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
		const customer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			enable_plan_immediately: true,
			phases: [
				{ starts_at: Date.now(), plans: [{ plan_id: pro.id }] },
				{
					starts_at: Date.now() + ms.days(30),
					plans: [{ plan_id: growth.id }],
				},
			],
		});
		const sessionId = getStripeSessionId(response.payment_url!);
		await expireCheckoutSession({ ctx, sessionId });

		const productsAfterExpiry = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		});
		expect(productsAfterExpiry).toHaveLength(0);
	},
);
