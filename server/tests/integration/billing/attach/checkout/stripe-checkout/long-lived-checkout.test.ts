import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { ms } from "@shared/utils/common/unixUtils";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CHECKOUT_BASE_URL =
	process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080";
const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

const getLongLivedCheckoutId = (paymentUrl: string | null | undefined) => {
	if (!paymentUrl) throw new Error("Expected payment_url");
	const checkoutId = paymentUrl.split("/l/")[1];
	if (!checkoutId) {
		throw new Error(`Expected long-lived checkout URL: ${paymentUrl}`);
	}
	return checkoutId;
};

const startLongLivedCheckout = async (checkoutId: string) => {
	const response = await fetch(
		`${CHECKOUT_BASE_URL}/checkouts/${checkoutId}/start`,
		{ redirect: "manual" },
	);
	expect(response.status).toBe(303);
	const location = response.headers.get("location");
	expect(location).toContain("checkout.stripe.com");
	return location!;
};

const getStripeSessionId = (url: string) => {
	const sessionId = url.match(STRIPE_SESSION_ID_REGEX)?.[0];
	if (!sessionId) throw new Error(`Expected Stripe checkout URL: ${url}`);
	return sessionId;
};

const expectStoredPaymentUrl = async ({
	ctx,
	checkoutId,
	paymentUrl,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	checkoutId: string;
	paymentUrl: string;
}) => {
	const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
	expect(checkout?.response?.payment_url).toBe(paymentUrl);
};

const expectLongLivedCheckoutExpiry = async ({
	ctx,
	checkoutId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	checkoutId: string;
}) => {
	const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
	expect(checkout?.expires_at).toBe(checkout!.created_at + ms.days(90));
};

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: creates reusable launcher for stripe checkout")}`,
	async () => {
		const customerId = "long-lived-checkout";
		const pro = products.pro({
			id: "pro-long-lived-checkout",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			long_lived_checkout: true,
		});

		expect(result.payment_url).toContain("/l/");
		expect(result.payment_url).not.toContain("checkout.stripe.com");

		const checkoutId = getLongLivedCheckoutId(result.payment_url);
		await expectLongLivedCheckoutExpiry({ ctx, checkoutId });

		const stripeUrl = await startLongLivedCheckout(checkoutId);
		const stripeSessionId = getStripeSessionId(stripeUrl);
		await expectStoredPaymentUrl({ ctx, checkoutId, paymentUrl: stripeUrl });

		const reusedStripeUrl = await startLongLivedCheckout(checkoutId);
		expect(getStripeSessionId(reusedStripeUrl)).toBe(stripeSessionId);
		await expectStoredPaymentUrl({ ctx, checkoutId, paymentUrl: reusedStripeUrl });

		await ctx.stripeCli.checkout.sessions.expire(stripeSessionId);
		const freshStripeUrl = await startLongLivedCheckout(checkoutId);
		expect(getStripeSessionId(freshStripeUrl)).not.toBe(stripeSessionId);
		await expectStoredPaymentUrl({
			ctx,
			checkoutId,
			paymentUrl: freshStripeUrl,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: normal attach still returns Stripe checkout")}`,
	async () => {
		const customerId = "long-lived-checkout-regression";
		const pro = products.pro({
			id: "pro-long-lived-regression",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		expect(result.payment_url).toContain("checkout.stripe.com");
		expect(result.payment_url).not.toContain("/l/");
	},
);
