/** Table cells: compact and column-aligned, e.g. "4000.00 USD". */
export const formatInvoiceAmount = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) => `${amount.toFixed(2)} ${currency.toUpperCase()}`;

/** The shared Total cell: amount, with any discount as a muted suffix. */
export function InvoiceTotalCell({
	total,
	currency,
	discountAmount,
}: {
	total: number;
	currency: string;
	discountAmount: number;
}) {
	return (
		<div>
			{formatInvoiceAmount({ amount: total, currency })}
			{discountAmount > 0 && (
				<span className="text-tertiary-foreground">
					{" "}
					(-{discountAmount.toFixed(2)})
				</span>
			)}
		</div>
	);
}

/** Sheets: full currency formatting, e.g. "$4,000.00". */
export const formatInvoiceCurrency = (amount: number, currency: string) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
