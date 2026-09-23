import type { CreateInvoicePreview } from "@autumn/shared";

export function ReissuePreviewTotals({
	preview,
	error,
	money,
}: {
	preview?: CreateInvoicePreview;
	error: string | null;
	money: (amount: number) => string;
}) {
	return (
		<div
			className="space-y-2 px-4 pt-3 text-sm"
			aria-live="polite"
			aria-atomic="true"
		>
			<div className="flex justify-between gap-2 text-xs text-tertiary-foreground">
				<span>Replacement invoice</span>
				<span>
					{error
						? "Preview unavailable"
						: preview
							? "Preview up to date"
							: "Recalculating…"}
				</span>
			</div>
			{preview ? (
				<>
					<dl className="space-y-1 tabular-nums">
						<div className="flex justify-between">
							<dt>Subtotal</dt>
							<dd>{money(preview.subtotal)}</dd>
						</div>
						{preview.discount_total !== 0 && (
							<div className="flex justify-between">
								<dt>Discounts</dt>
								<dd>{money(-preview.discount_total)}</dd>
							</div>
						)}
						{preview.tax && preview.tax.amount_inclusive !== 0 && (
							<div className="flex justify-between">
								<dt>Tax included in subtotal</dt>
								<dd>{money(preview.tax.amount_inclusive)}</dd>
							</div>
						)}
						<div className="flex justify-between">
							<dt>Tax added</dt>
							<dd>{money(preview.tax?.amount_exclusive ?? 0)}</dd>
						</div>
						<div className="flex justify-between border-t pt-2 font-medium">
							<dt>Invoice total</dt>
							<dd>{money(preview.total)}</dd>
						</div>
						{!!preview.invoice_credits?.applied && (
							<div className="flex justify-between">
								<dt>Credit applied</dt>
								<dd>{money(-preview.invoice_credits.applied)}</dd>
							</div>
						)}
						{preview.amount_due !== preview.total && (
							<div className="flex justify-between font-medium">
								<dt>Amount due</dt>
								<dd>{money(preview.amount_due)}</dd>
							</div>
						)}
					</dl>
					{!preview.tax?.total && (
						<p className="text-xs text-tertiary-foreground">
							No tax added in this preview.
						</p>
					)}
				</>
			) : (
				<p className="text-xs text-tertiary-foreground">
					{error
						? "Resolve the issue below to see the updated total."
						: "Waiting for an updated tax calculation and total."}
				</p>
			)}
		</div>
	);
}
