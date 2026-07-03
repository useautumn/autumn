import {
	CusProductStatus,
	type DfuFlashResult,
	type FullCusProduct,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { CusService } from "@/internal/customers/CusService.js";

export const FLASH_PATH = "/billing.import";

export type FlashClient = {
	post: (
		path: string,
		body: unknown,
		headers?: Record<string, string>,
	) => Promise<unknown>;
};

export type RevenueCatMockFixtures = {
	subscriptions?: unknown[];
	purchases?: unknown[];
	products?: unknown[];
};

export const callFlash = async (
	client: FlashClient,
	body: unknown,
	mock?: RevenueCatMockFixtures,
): Promise<{
	result: DfuFlashResult | null;
	errorCode: string | null;
	errorMessage: string | null;
}> => {
	const headers = mock
		? {
				"x-mock-revenuecat": "true",
				"x-mock-revenuecat-fixtures": JSON.stringify(mock),
			}
		: undefined;
	try {
		const result = (await client.post(
			FLASH_PATH,
			body,
			headers,
		)) as DfuFlashResult;
		return { result, errorCode: null, errorMessage: null };
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return {
			result: null,
			errorCode: e.code ?? null,
			errorMessage: e.message ?? null,
		};
	}
};

export const getFlashedCustomerProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		],
		withEntities: true,
	});
	return fullCustomer.customer_products.find(
		(product) => product.product_id === productId,
	);
};

// Standalone test-mode Stripe customer (real cus_...) so flashed processor ids resolve.
export const createRealStripeCustomer = async (
	ctx: TestContext,
	{ email }: { email: string },
): Promise<string> => {
	const customer = await ctx.stripeCli.customers.create({
		email,
		payment_method: "pm_card_visa",
		invoice_settings: { default_payment_method: "pm_card_visa" },
	});
	return customer.id;
};

// Real test-mode Stripe customer + subscription (real cus_.../sub_...) for flashed billables.
export const createRealStripeSub = async (
	ctx: TestContext,
	{
		email,
		amount = 1000,
		interval = "month",
		customerId,
	}: {
		email: string;
		amount?: number;
		interval?: "month" | "year";
		customerId?: string;
	},
): Promise<{ customerId: string; subscriptionId: string }> => {
	const stripeCustomerId =
		customerId ?? (await createRealStripeCustomer(ctx, { email }));
	const price = await ctx.stripeCli.prices.create({
		unit_amount: amount,
		currency: "usd",
		recurring: { interval },
		product_data: { name: `dfu-flash-${email}` },
	});
	const sub = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: price.id }],
	});
	return { customerId: stripeCustomerId, subscriptionId: sub.id };
};

// Real test-mode Stripe customer bound to a test clock frozen at `frozenTime`
// (a past instant). Advancing the clock to ≈ real now makes the sub's period
// bracket Date.now(), which the flash uses as its import "now".
export const createRealStripeCustomerOnClock = async (
	ctx: TestContext,
	{ email, frozenTime }: { email: string; frozenTime: number },
): Promise<{ customerId: string; testClockId: string }> => {
	const testClock = await ctx.stripeCli.testHelpers.testClocks.create({
		frozen_time: Math.floor(frozenTime / 1000),
	});
	const customer = await ctx.stripeCli.customers.create({
		email,
		payment_method: "pm_card_visa",
		invoice_settings: { default_payment_method: "pm_card_visa" },
		test_clock: testClock.id,
	});
	return { customerId: customer.id, testClockId: testClock.id };
};

// Subscription on a clock-bound customer (auto-binds to that clock). Its
// start_date and period follow the clock, so the sub can be genuinely
// mid-cycle / mid-trial relative to real now after advancing.
export const createRealStripeSubOnClock = async (
	ctx: TestContext,
	{
		customerId,
		amount = 1000,
		interval = "month",
		label,
		trialPeriodDays,
	}: {
		customerId: string;
		amount?: number;
		interval?: "month" | "year";
		label: string;
		trialPeriodDays?: number;
	},
): Promise<{ subscriptionId: string; priceId: string }> => {
	const price = await ctx.stripeCli.prices.create({
		unit_amount: amount,
		currency: "usd",
		recurring: { interval },
		product_data: { name: `dfu-flash-clock-${label}` },
	});
	const sub = await ctx.stripeCli.subscriptions.create({
		customer: customerId,
		items: [{ price: price.id }],
		...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
	});
	return { subscriptionId: sub.id, priceId: price.id };
};

// Thin wrapper over advanceTestClock (advances the clock + waits for Stripe).
export const advanceClock = async (
	ctx: TestContext,
	{
		testClockId,
		advanceTo,
		numberOfDays,
		numberOfMonths,
		waitForSeconds,
	}: {
		testClockId: string;
		advanceTo?: number;
		numberOfDays?: number;
		numberOfMonths?: number;
		waitForSeconds?: number;
	},
): Promise<number> =>
	advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo,
		numberOfDays,
		numberOfMonths,
		waitForSeconds,
	});

export const NOW = Date.now();
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

export const mockProduct = ({
	internalId,
	storeId,
	type = "subscription",
}: {
	internalId: string;
	storeId: string;
	type?: "subscription" | "one_time";
}) => ({
	object: "product",
	id: internalId,
	store_identifier: storeId,
	type,
	created_at: NOW,
	app_id: "app_mock",
	display_name: storeId,
});

export const mockSubscription = ({
	id,
	internalProductId,
	status = "active",
	autoRenewalStatus = "will_renew",
	startsAt = NOW,
	periodEndsAt = NOW + THIRTY_DAYS_MS,
}: {
	id: string;
	internalProductId: string;
	status?: string;
	autoRenewalStatus?: string;
	startsAt?: number;
	periodEndsAt?: number;
}) => ({
	object: "subscription",
	id,
	product_id: internalProductId,
	store: "app_store",
	store_subscription_identifier: `store_${id}`,
	status,
	starts_at: startsAt,
	current_period_starts_at: startsAt,
	current_period_ends_at: periodEndsAt,
	auto_renewal_status: autoRenewalStatus,
	gives_access: status === "active" || status === "trialing",
});

export const mockPurchase = ({
	id,
	internalProductId,
	purchasedAt = NOW,
}: {
	id: string;
	internalProductId: string;
	purchasedAt?: number;
}) => ({
	object: "purchase",
	id,
	product_id: internalProductId,
	store: "app_store",
	purchased_at: purchasedAt,
	status: "owned",
});

export const rcSubscriptionProduct = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

export const rcOneOffProduct = ({ id }: { id: string }) =>
	products.base({
		id,
		isAddOn: true,
		items: [items.oneOffPrice({ price: 20 })],
	});
