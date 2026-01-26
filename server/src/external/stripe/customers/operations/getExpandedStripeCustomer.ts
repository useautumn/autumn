import { InternalError } from "@autumn/shared";
import { tryCatch } from "@shared/utils";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { StripeCustomerWithDiscount } from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Stripe Customer with expanded fields for billing operations.
 * Extends `StripeCustomerWithDiscount` with additional expanded fields.
 *
 * @see https://docs.stripe.com/changelog/clover/2025-09-30/add-discount-source-property
 */
export type ExpandedStripeCustomer = Omit<
	StripeCustomerWithDiscount,
	"test_clock" | "invoice_settings"
> & {
	test_clock: Stripe.TestHelpers.TestClock | null;
	invoice_settings: Omit<
		Stripe.Customer.InvoiceSettings,
		"default_payment_method"
	> & {
		default_payment_method: Stripe.PaymentMethod | null;
	};
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
					"discount.source.coupon.applies_to",
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
