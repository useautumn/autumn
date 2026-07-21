/** Reproduces Runable's checkout-completion/direct-attach race; current code creates two paid Pro subscriptions.
 * Green requires one active Pro product, one Stripe subscription, and one paid initial invoice. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	createAmountCoupon,
	createPromotionCode,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { redis } from "@/external/redis/initRedis";
import { CusService } from "@/internal/customers/CusService";

const customerId = "runable-dual-checkout-race";

const buildCheckoutLockKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: string;
}) => `checkout_lock:${orgId}:${env}:${customerId}`;

const waitForCheckoutPaymentMethod = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Parameters<typeof createAmountCoupon>[0]["stripeCli"];
	stripeCustomerId: string;
}) => {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const methods = await stripeCli.paymentMethods.list({
			customer: stripeCustomerId,
			type: "card",
			limit: 1,
		});
		if (methods.data.length > 0) return;
		await timeout(200);
	}
	throw new Error("Checkout did not attach a payment method within 30 seconds");
};

test(
	`${chalk.yellowBright("checkout race: completion overlapping a fresh attach creates only one subscription")}`,
	async () => {
		const basic = products.base({
			id: "runable_basic",
			isDefault: true,
			items: [items.monthlyCredits({ includedUsage: 51_000 })],
		});
		const pro = products.base({
			id: "runable_pro_25_monthly",
			items: [
				items.monthlyPrice({ price: 25 }),
				items.monthlyCredits({ includedUsage: 51_000 }),
			],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, withDefault: true }),
				s.products({ list: [basic, pro] }),
			],
			actions: [],
		});

		const coupon = await createAmountCoupon({
			stripeCli: ctx.stripeCli,
			amountOffCents: 2_400,
		});
		const promotionCode = await createPromotionCode({
			stripeCli: ctx.stripeCli,
			coupon,
			code: "RUN1-RACE-",
		});
		const attachParams = {
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required" as const,
			discounts: [{ promotion_code: promotionCode.code }],
			checkout_session_params: {
				adaptive_pricing: { enabled: true },
				billing_address_collection: "required" as const,
			},
			success_url: "https://example.com/?checkout_success=true",
		};

		const firstAttach = await autumnV2_2.billing.attach(attachParams, {
			timeout: 0,
		});
		expect(firstAttach.payment_url).toContain("checkout.stripe.com");

		const checkoutLockKey = buildCheckoutLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
		});
		await redis.del(checkoutLockKey);

		const secondAttach = await autumnV2_2.billing.attach(attachParams, {
			timeout: 0,
		});
		expect(secondAttach.payment_url).toContain("checkout.stripe.com");
		expect(secondAttach.payment_url).not.toBe(firstAttach.payment_url);

		await timeout(121_000);
		const customerBeforeCheckout = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerIdBeforeCheckout =
			customerBeforeCheckout.processor?.id ??
			customerBeforeCheckout.processor?.processor_id;
		expect(stripeCustomerIdBeforeCheckout).toBeDefined();

		const checkoutCompletion = completeStripeCheckoutFormV2({
			url: secondAttach.payment_url,
			billingAddress: {
				country: "US",
				line1: "123 Main Street",
				city: "New York",
				state: "NY",
				postal_code: "10001",
			},
		});
		await waitForCheckoutPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCustomerId: stripeCustomerIdBeforeCheckout!,
		});

		const thirdAttach = await autumnV2_2.billing.attach(attachParams, {
			timeout: 0,
		});
		await checkoutCompletion;
		expect(thirdAttach.payment_url).toBe(secondAttach.payment_url);
		await timeout(12_000);

		const [customer, fullCustomer] = await Promise.all([
			autumnV1.customers.get<ApiCustomerV3>(customerId),
			CusService.getFull({ ctx, idOrInternalId: customerId, withSubs: true }),
		]);
		const stripeCustomerId =
			fullCustomer.processor?.id ?? fullCustomer.processor?.processor_id;
		expect(stripeCustomerId).toBeDefined();

		const stripeSubscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId!,
			status: "all",
		});
		const activeProProducts = fullCustomer.customer_products.filter(
			(product) => product.product.id === pro.id && product.status === "active",
		);
		const paidInitialInvoices = (customer.invoices ?? []).filter(
			(invoice) => invoice.status === "paid" && invoice.total === 1,
		);

		expect({
			activeProProducts: activeProProducts.length,
			stripeSubscriptions: stripeSubscriptions.data.length,
			paidInitialInvoices: paidInitialInvoices.length,
		}).toEqual({
			activeProProducts: 1,
			stripeSubscriptions: 1,
			paidInitialInvoices: 1,
		});
	},
	300_000,
);
