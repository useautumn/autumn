import type { PreviewTax } from "@autumn/shared";
import { stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";

const PREVIEW_LINE_DESCRIPTION = "autumn_tax_preview_net_subtotal";

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
				description: PREVIEW_LINE_DESCRIPTION,
				tax_behavior: "exclusive",
			},
		],
	});

	const lines = preview.lines.has_more
		? await getStripeInvoiceLineItems({
				stripeClient: stripeCli,
				invoiceId: preview.id,
			})
		: preview.lines.data;
	const previewLineTaxes =
		lines.find((line) => line.description === PREVIEW_LINE_DESCRIPTION)
			?.taxes ?? [];

	const sumTaxes = (behavior: "inclusive" | "exclusive") =>
		stripeToAtmnAmount({
			amount: previewLineTaxes
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
