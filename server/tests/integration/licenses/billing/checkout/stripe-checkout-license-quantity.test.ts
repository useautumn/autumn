import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseAttachPreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const DEV_SEAT_PRICE = 20;
const INCLUDED_SEATS = 2;
const REQUESTED_SEATS = 5;
const PAID_SEATS = REQUESTED_SEATS - INCLUDED_SEATS;

test.concurrent(
	`${chalk.yellowBright("license checkout: paid quantities attach after Stripe Checkout")}`,
	async () => {
		const customerId = "license-checkout-paid-quantity";
		const pro = products.base({
			id: "checkout-pro",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "checkout-dev-seat",
			items: [items.monthlyPrice({ price: DEV_SEAT_PRICE })],
			group: "checkout-dev-seat-licenses",
		});

		const {
			customer: fullCustomer,
			ctx,
			autumnV1,
			autumnV2_3,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [pro, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: devSeat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		const stripeCustomerId = fullCustomer?.processor?.id;
		if (!stripeCustomerId) throw new Error("Expected a Stripe customer");

		const stripeCustomer =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		if (stripeCustomer.deleted) throw new Error("Stripe customer was deleted");
		expect(stripeCustomer.invoice_settings.default_payment_method).toBeNull();

		const paymentMethods = await ctx.stripeCli.paymentMethods.list({
			customer: stripeCustomerId,
			type: "card",
		});
		expect(paymentMethods.data).toHaveLength(0);

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: REQUESTED_SEATS },
			],
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expectLicenseAttachPreviewCorrect({
			preview,
			total: PAID_SEATS * DEV_SEAT_PRICE,
		});

		const result =
			await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);
		expect(result.payment_url).toContain("checkout.stripe.com");
		if (!result.payment_url) throw new Error("Expected a Stripe Checkout URL");

		const customerBeforeCheckout =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerBeforeCheckout,
			notPresent: [pro.id],
		});
		expectCustomerLicenses({
			customer: customerBeforeCheckout,
			count: 0,
			licenses: [],
		});

		await completeStripeCheckoutFormV2({ url: result.payment_url });

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: pro.id,
					granted: REQUESTED_SEATS,
					usage: 0,
					remaining: REQUESTED_SEATS,
					paid_quantity: PAID_SEATS,
				},
			],
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: PAID_SEATS * DEV_SEAT_PRICE,
			latestStatus: "paid",
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
