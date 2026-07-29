import { formatAmount } from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { Decimal } from "decimal.js";

type PreviewTotalsBlockPreviewData = {
	currency: string;
	subtotal: number;
	total: number;
	tax?: {
		total: number;
		status: "complete" | "incomplete";
	};
	invoice_credits?: {
		balance: number;
	};
	checkout_type?: "stripe_checkout" | "autumn_checkout" | null;
};

const fmt = (amount: number, currency: string) =>
	formatAmount({
		amount: new Decimal(amount).toDecimalPlaces(2).toNumber(),
		currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

export function PreviewTotalsBlock({
	previewData,
}: {
	previewData: PreviewTotalsBlockPreviewData;
}) {
	const showTaxRow =
		previewData.tax?.status === "complete" && previewData.tax.total > 0;
	const taxAmount = showTaxRow ? (previewData.tax?.total ?? 0) : 0;

	const creditBalance = previewData.invoice_credits?.balance ?? 0;
	const willRedirectToStripeCheckout =
		previewData.checkout_type === "stripe_checkout";
	const subtotalBeforeCredit = Math.max(previewData.subtotal, 0) + taxAmount;
	// FE-side cap, purely for the row's displayed amount and rollover
	// tooltip. The authoritative numeric total comes from the server.
	const creditApplied =
		!willRedirectToStripeCheckout && creditBalance > 0
			? Math.min(creditBalance, subtotalBeforeCredit)
			: 0;
	// Hide the row entirely when there's no credit on file. We also hide
	// when redirecting to Stripe Checkout (Stripe applies the balance in
	// their hosted form — showing it here would diverge) or when nothing
	// would actually be applied (e.g. $0 plan with credit).
	const showCreditRow =
		creditBalance > 0 && !willRedirectToStripeCheckout && creditApplied > 0;
	const creditRollover = creditBalance - creditApplied;

	const { currency } = previewData;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-muted-foreground">
					Subtotal
				</span>
				<span className="text-sm font-medium tabular-nums text-muted-foreground">
					{fmt(previewData.subtotal, currency)}
				</span>
			</div>

			{showTaxRow && (
				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">Tax</span>
					<span className="text-sm tabular-nums text-muted-foreground">
						{fmt(taxAmount, currency)}
					</span>
				</div>
			)}

			{showCreditRow && (
				<div className="flex items-center justify-between">
					{creditRollover > 0 ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="text-sm text-muted-foreground underline decoration-dotted decoration-tertiary-foreground/40 underline-offset-4 cursor-help">
									Invoice Credits
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">
								{fmt(creditBalance, currency)} total credit on file.{" "}
								{fmt(creditRollover, currency)} will roll over to the next
								invoice.
							</TooltipContent>
						</Tooltip>
					) : (
						<span className="text-sm text-muted-foreground">
							Invoice Credits
						</span>
					)}
					<span className="text-sm tabular-nums text-muted-foreground">
						-{fmt(creditApplied, currency)}
					</span>
				</div>
			)}

			<div className="flex items-center justify-between border-t border-border pt-2 mt-1">
				<span className="text-sm font-semibold text-foreground">
					Total Due Now
				</span>
				<span className="text-sm font-semibold text-foreground tabular-nums">
					{fmt(previewData.total, currency)}
				</span>
			</div>
		</div>
	);
}
