import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { ms } from "@shared/utils/common/unixUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

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

		expect(result.payment_url).toContain("/co/");
		expect(result.payment_url).not.toContain("checkout.stripe.com");

		const checkoutId = getLongLivedCheckoutId(result.payment_url);
		await expectLongLivedCheckoutExpiry({ ctx, checkoutId });

		const stripeUrl = await startLongLivedCheckout(checkoutId);
		const stripeSessionId = getStripeSessionId(stripeUrl);
		await expectStoredPaymentUrl({ ctx, checkoutId, paymentUrl: stripeUrl });

		const reusedStripeUrl = await startLongLivedCheckout(checkoutId);
		expect(getStripeSessionId(reusedStripeUrl)).toBe(stripeSessionId);
		await expectStoredPaymentUrl({
			ctx,
			checkoutId,
			paymentUrl: reusedStripeUrl,
		});

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
		expect(result.payment_url).not.toContain("/co/");
	},
);
