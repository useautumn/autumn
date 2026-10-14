export const formatInvoiceAmount = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) => `${amount.toFixed(2)} ${currency.toUpperCase()}`;

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

export const formatInvoiceCurrency = (amount: number, currency: string) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
