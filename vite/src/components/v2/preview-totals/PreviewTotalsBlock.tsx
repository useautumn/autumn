import { formatAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

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
	const showCreditRow = creditApplied > 0;
	const creditRollover = creditBalance - creditApplied;

	const { currency } = previewData;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-t2">Subtotal</span>
				<span className="text-sm font-medium tabular-nums text-t2">
					{fmt(previewData.subtotal, currency)}
				</span>
			</div>

			{showTaxRow && (
				<div className="flex items-center justify-between">
					<span className="text-sm text-t2">Tax</span>
					<span className="text-sm tabular-nums text-t2">
						{fmt(taxAmount, currency)}
					</span>
				</div>
			)}

			{showCreditRow && (
				<div className="flex items-center justify-between">
					{creditRollover > 0 ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="text-sm text-t2 underline decoration-dotted decoration-t3/40 underline-offset-4 cursor-help">
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
						<span className="text-sm text-t2">Invoice Credits</span>
					)}
					<span className="text-sm tabular-nums text-t2">
						-{fmt(creditApplied, currency)}
					</span>
				</div>
			)}

			<div className="flex items-center justify-between border-t border-border/60 pt-2 mt-1">
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
