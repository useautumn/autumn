import { InternalError } from "@autumn/shared";
import { tryCatch } from "@shared/utils";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export type ExpandedStripeCustomer = Omit<
	Stripe.Customer,
	"test_clock" | "invoice_settings" | "discount"
> & {
	test_clock: Stripe.TestHelpers.TestClock | null;
	invoice_settings: Omit<
		Stripe.Customer.InvoiceSettings,
		"default_payment_method"
	> & {
		default_payment_method: Stripe.PaymentMethod | null;
	};
	discount:
		| (Omit<Stripe.Discount, "coupon"> & {
				coupon: Stripe.Coupon & {
					applies_to: Stripe.Coupon.AppliesTo | null;
				};
		  })
		| null;
};

export function getExpandedStripeCustomer({
	ctx,
	stripeCustomerId,
	errorOnNotFound,
}: {
	ctx: AutumnContext;
	stripeCustomerId: string;
	errorOnNotFound: true;
}): Promise<ExpandedStripeCustomer>;
export function getExpandedStripeCustomer({
	ctx,
	stripeCustomerId,
	errorOnNotFound,
}: {
	ctx: AutumnContext;
	stripeCustomerId?: string;
	errorOnNotFound?: false;
}): Promise<ExpandedStripeCustomer | undefined>;
export async function getExpandedStripeCustomer({
	ctx,
	stripeCustomerId,
	errorOnNotFound = false,
}: {
	ctx: AutumnContext;
	stripeCustomerId?: string;
	errorOnNotFound?: boolean;
}): Promise<ExpandedStripeCustomer | undefined> {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const getExpandedStripeCustomerOptional = async () => {
		if (!stripeCustomerId) return undefined;

		const { data: stripeCustomer, error } = await tryCatch(
			stripeCli.customers.retrieve(stripeCustomerId, {
				expand: [
					"test_clock",
					"invoice_settings.default_payment_method",
					"discount.coupon.applies_to",
				],
			}),
		);

		if (error) {
			if (
				error instanceof Stripe.errors.StripeError &&
				error.code?.includes("resource_missing")
			) {
				return undefined;
			}
			throw error;
		}

		if (stripeCustomer.deleted) return undefined;

		return stripeCustomer as ExpandedStripeCustomer;
	};

	const stripeCustomer = await getExpandedStripeCustomerOptional();
	if (!stripeCustomer && errorOnNotFound) {
		throw new InternalError({
			message: stripeCustomerId
				? `Stripe customer not found: ${stripeCustomerId}`
				: "Stripe customer id is required.",
		});
	}

	return stripeCustomer;
}
