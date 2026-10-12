import type { PreviewTax } from "@autumn/shared";
import { stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";

const STATUS_BY_STRIPE_STATUS: Record<
	Stripe.Invoice.AutomaticTax.Status,
	PreviewTax["status"]
> = {
	complete: "complete",
	requires_location_inputs: "requires_location",
	failed: "incomplete",
};

export const isThirdPartyTaxProviderError = (err: unknown) =>
	String((err as { message?: string })?.message ?? err).includes(
		"third party tax provider",
	);

/** Tax via a draft invoice preview, which runs whichever tax provider the Stripe account uses. */
export const computeInvoicePreviewTax = async ({
	stripeCli,
	currency,
	stripeCustomerId,
	customerDetails,
	taxableMinorUnits,
}: {
	stripeCli: Stripe;
	currency: string;
	stripeCustomerId?: string;
	customerDetails?: Stripe.Tax.CalculationCreateParams.CustomerDetails;
	taxableMinorUnits: number;
}): Promise<PreviewTax> => {
	const preview = await stripeCli.invoices.createPreview({
		currency,
		customer: stripeCustomerId,
		automatic_tax: { enabled: true },
		discounts: "",
		customer_details: customerDetails && {
			address: customerDetails.address && {
				country: customerDetails.address.country,
				line1: customerDetails.address.line1 || undefined,
				line2: customerDetails.address.line2 || undefined,
				city: customerDetails.address.city || undefined,
				state: customerDetails.address.state || undefined,
				postal_code: customerDetails.address.postal_code || undefined,
			},
			tax_ids: customerDetails.tax_ids,
			tax_exempt: taxabilityOverrideToTaxExempt(
				customerDetails.taxability_override,
			),
		},
		invoice_items: [
			{
				amount: taxableMinorUnits,
				currency,
				description: "preview_net_subtotal",
				tax_behavior: "exclusive",
			},
		],
	});

	const sumTaxes = (behavior: "inclusive" | "exclusive") =>
		stripeToAtmnAmount({
			amount: (preview.total_taxes ?? [])
				.filter((tax) => tax.tax_behavior === behavior)
				.reduce((sum, tax) => sum + tax.amount, 0),
			currency,
		});
	const amountInclusive = sumTaxes("inclusive");
	const amountExclusive = sumTaxes("exclusive");

	return {
		total: amountInclusive + amountExclusive,
		amount_inclusive: amountInclusive,
		amount_exclusive: amountExclusive,
		currency,
		status: STATUS_BY_STRIPE_STATUS[preview.automatic_tax.status ?? "failed"],
	};
};

const taxabilityOverrideToTaxExempt = (
	override?: Stripe.Tax.CalculationCreateParams.CustomerDetails.TaxabilityOverride,
): Stripe.InvoiceCreatePreviewParams.CustomerDetails.TaxExempt | undefined => {
	if (override === "customer_exempt") return "exempt";
	if (override === "reverse_charge") return "reverse";
	return override;
};
