import type { CreateInvoicePreview } from "@autumn/shared";
import { formatAmount } from "@autumn/shared";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const formatDate = (timestamp: number) =>
	format(new Date(timestamp), "MMMM d, yyyy");

const cleanDescription = (description: string) =>
	description.replace(/\s*\(\s*\)/g, "").trim();

const money = ({ amount, currency }: { amount: number; currency: string }) =>
	formatAmount({
		amount,
		currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

function MetaRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex leading-[1.5]">
			<dt className="w-[8.17em] shrink-0 whitespace-nowrap font-medium">
				{label}
			</dt>
			<dd className="font-medium">{value}</dd>
		</div>
	);
}

function TotalRow({
	label,
	value,
	emphasis = false,
}: {
	label: string;
	value: string;
	emphasis?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-4 border-[#ebebeb] border-t pt-[0.2em] pb-[0.18em] leading-[1.21]",
				emphasis && "font-semibold",
			)}
		>
			<span>{label}</span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}

export function InvoicePreviewDocument({
	preview,
	issuerName,
	billedTo,
	billedToEmail,
	memo,
	footer,
}: {
	preview: CreateInvoicePreview;
	issuerName: string;
	billedTo: string;
	billedToEmail?: string;
	memo?: string;
	footer?: string;
}) {
	const { currency } = preview;
	// Stripe lists custom charges first, alphabetically, then catalog lines.
	const lines = [
		...preview.lines
			.filter((line) => line.plan_id === null)
			.sort((a, b) => a.description.localeCompare(b.description)),
		...preview.lines.filter((line) => line.plan_id !== null),
	];
	const upperCurrency = currency.toUpperCase();
	const total = money({ amount: preview.total, currency });
	const dueLabel = preview.due_date
		? `${total} ${upperCurrency} due ${formatDate(preview.due_date)}`
		: `${total} ${upperCurrency} due`;

	return (
		<div
			className="mx-auto flex aspect-[8.5/11] h-full max-h-full w-auto max-w-full flex-col overflow-hidden bg-white px-[4.9%] py-[3.8%] font-sans text-black shadow-lg"
			style={{ fontSize: "min(1.6vh, 11px)" }}
		>
			<header className="mt-[1em] flex items-start justify-between gap-8">
				<h1 className="font-semibold text-[2em] leading-[1.2em]">Invoice</h1>
				<span className="font-semibold text-[#808080] text-[2em] leading-[1.2em]">
					{issuerName}
				</span>
			</header>

			<dl className="mt-[2.2em]">
				<MetaRow label="Date of issue" value={formatDate(Date.now())} />
				{preview.due_date ? (
					<MetaRow label="Date due" value={formatDate(preview.due_date)} />
				) : null}
			</dl>

			<div className="mt-[1.4em] grid grid-cols-[40.98%_1fr] leading-[1.5]">
				<div className="font-semibold">{issuerName}</div>
				<div>
					<div className="font-semibold">Bill to</div>
					<div className="mt-1 break-words">{billedTo}</div>
					{billedToEmail ? (
						<div className="break-words">{billedToEmail}</div>
					) : null}
				</div>
			</div>

			<h2 className="mt-[1.9em] font-semibold text-[1.5em] leading-[1.35]">
				{dueLabel}
			</h2>

			{memo ? <p className="mt-[1.3em] whitespace-pre-wrap">{memo}</p> : null}

			<table className="mt-[1.6em] w-full table-fixed border-collapse">
				<colgroup>
					<col className="w-[64.7%]" />
					<col className="w-[8.55%]" />
					<col className="w-[11.68%]" />
					<col className="w-[15.07%]" />
				</colgroup>
				<thead>
					<tr className="border-black border-b font-normal text-[0.833em] text-black">
						<th className="pb-[0.62em] text-left font-normal">Description</th>
						<th className="pb-[0.62em] pr-[3.8em] text-right font-normal">
							Qty
						</th>
						<th className="pb-[0.62em] text-right font-normal">Unit price</th>
						<th className="pb-[0.62em] text-right font-normal">Amount</th>
					</tr>
				</thead>
				<tbody>
					{lines.map((line, index) => {
						const quantity = line.quantity ?? 1;
						const unitPrice =
							quantity > 0 ? line.amount / quantity : line.amount;
						return (
							<tr
								className={cn(
									"align-top",
									index < lines.length - 1 && "border-[#ebebeb] border-b",
								)}
								key={`${line.plan_id ?? "custom"}-${line.feature_id ?? "base"}-${index}`}
							>
								<td className="pt-[0.62em] pb-[1.83em] pr-4">
									{cleanDescription(line.description)}
								</td>
								<td className="pt-[0.62em] pr-[3.8em] pb-[1.83em] text-right tabular-nums">
									{quantity}
								</td>
								<td className="pt-[0.62em] pb-[1.83em] text-right tabular-nums">
									{money({ amount: unitPrice, currency })}
								</td>
								<td className="pt-[0.62em] pb-[1.83em] text-right tabular-nums">
									{money({ amount: line.amount, currency })}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>

			<div className="ml-auto w-[50%]">
				<TotalRow
					label="Subtotal"
					value={money({ amount: preview.subtotal, currency })}
				/>
				{preview.discount_total > 0 ? (
					<TotalRow
						label="Discount"
						value={`-${money({ amount: preview.discount_total, currency })}`}
					/>
				) : null}
				{preview.tax ? (
					<TotalRow
						label={
							preview.tax.status === "complete" ? "Tax" : "Tax (estimated)"
						}
						value={money({ amount: preview.tax.total, currency })}
					/>
				) : null}
				<TotalRow label="Total" value={total} />
				<TotalRow
					emphasis
					label="Amount due"
					value={`${total} ${upperCurrency}`}
				/>
			</div>

			{footer ? (
				<footer className="mt-[2.65em] whitespace-pre-wrap">{footer}</footer>
			) : null}
		</div>
	);
}
