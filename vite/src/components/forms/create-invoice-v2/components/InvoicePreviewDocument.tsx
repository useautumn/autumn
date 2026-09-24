import type { CreateInvoicePreview } from "@autumn/shared";
import { formatAmount } from "@autumn/shared";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { InvoiceDiscountRow } from "../utils/invoiceDiscountRows";

const formatDate = (timestamp: number) =>
	format(new Date(timestamp), "MMMM d, yyyy");

const cleanDescription = (description: string) =>
	description.replace(/\s*\(\s*\)/g, "").trim();

const money = ({ amount, currency }: { amount: number; currency: string }) =>
	formatAmount({
		amount,
		currency,
		minFractionDigits: 2,
		maxFractionDigits: 2,
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

const FIRST_PAGE_ROWS = 13;
const LATER_PAGE_ROWS = 21;

function Page({
	children,
	pageNumber,
	pageCount,
}: {
	children: React.ReactNode;
	pageNumber: number;
	pageCount: number;
}) {
	return (
		<div className="relative mx-auto flex h-[56.94rem] w-full max-w-[44rem] shrink-0 flex-col overflow-hidden bg-white px-[4.9%] py-[3.8%] font-sans text-[10px] text-black shadow-lg">
			{children}
			{pageCount > 1 ? (
				<span className="absolute right-[4.9%] bottom-[3.8%] text-[0.833em]">
					Page {pageNumber} of {pageCount}
				</span>
			) : null}
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
	discountRows = [],
	issueDay,
	dueDay,
}: {
	preview: CreateInvoicePreview;
	issuerName: string;
	billedTo: string;
	billedToEmail?: string;
	memo?: string;
	footer?: string;
	discountRows?: InvoiceDiscountRow[];
	/** The picked calendar days, shown as chosen rather than as Stripe's timestamps. */
	issueDay?: number | null;
	dueDay?: number | null;
}) {
	const { currency } = preview;
	// Stripe lists custom charges first, highest amount first, then catalog lines.
	const lines = [
		...preview.lines
			.filter((line) => line.plan_id === null)
			.sort((a, b) => b.amount - a.amount),
		...preview.lines.filter((line) => line.plan_id !== null),
	];
	const pages: (typeof lines)[] = [lines.slice(0, FIRST_PAGE_ROWS)];
	for (let i = FIRST_PAGE_ROWS; i < lines.length; i += LATER_PAGE_ROWS) {
		pages.push(lines.slice(i, i + LATER_PAGE_ROWS));
	}
	const upperCurrency = currency.toUpperCase();
	const total = money({ amount: preview.total, currency });
	const issueDate = issueDay ?? preview.issue_date;
	const dueDate = dueDay ?? preview.due_date;
	const dueLabel = dueDate
		? `${total} ${upperCurrency} due ${formatDate(dueDate)}`
		: `${total} ${upperCurrency} due`;

	return (
		<div className="flex flex-col gap-6">
			{pages.map((pageLines, pageIndex) => {
				const isFirst = pageIndex === 0;
				const isLast = pageIndex === pages.length - 1;
				const rowOffset = isFirst
					? 0
					: FIRST_PAGE_ROWS + (pageIndex - 1) * LATER_PAGE_ROWS;

				return (
					<Page
						key={`page-${pageIndex}`}
						pageCount={pages.length}
						pageNumber={pageIndex + 1}
					>
						{isFirst ? (
							<>
								<header className="mt-[1em] flex items-start justify-between gap-8">
									<h1 className="font-semibold text-[2em] leading-[1.2em]">
										Invoice
									</h1>
									<span className="font-semibold text-[#808080] text-[2em] leading-[1.2em]">
										{issuerName}
									</span>
								</header>

								<dl className="mt-[2.2em]">
									<MetaRow
										label="Date of issue"
										value={formatDate(issueDate)}
									/>
									{dueDate ? (
										<MetaRow label="Date due" value={formatDate(dueDate)} />
									) : null}
								</dl>

								<div className="mt-[1.4em] grid grid-cols-[40.98%_1fr] leading-[1.5]">
									<div className="font-semibold">{issuerName}</div>
									<div>
										<div className="font-semibold">Bill to</div>
										<div className="break-words">{billedTo}</div>
										{billedToEmail ? (
											<div className="break-words">{billedToEmail}</div>
										) : null}
									</div>
								</div>

								<h2 className="mt-[1.9em] font-semibold text-[1.5em] leading-[1.35]">
									{dueLabel}
								</h2>

								{memo ? (
									<p className="mt-[1.3em] whitespace-pre-wrap">{memo}</p>
								) : null}
							</>
						) : null}

						<table
							className={cn(
								"w-full table-auto border-collapse",
								isFirst ? "mt-[1.6em]" : "mt-[2.4em]",
							)}
						>
							{/* Stripe sizes the numeric columns to their content and
							    right-aligns them; description absorbs the rest. */}
							<colgroup>
								<col className="w-full" />
								<col className="w-px" />
								<col className="w-px" />
								<col className="w-px" />
							</colgroup>
							{isFirst ? (
								<thead>
									<tr className="border-black border-b font-normal text-[0.833em] text-black">
										<th className="pb-[0.62em] text-left font-normal">
											Description
										</th>
										<th className="whitespace-nowrap pb-[0.62em] pr-[3.8em] text-right font-normal">
											Qty
										</th>
										<th className="whitespace-nowrap pb-[0.62em] text-right font-normal">
											Unit price
										</th>
										<th className="whitespace-nowrap pb-[0.62em] text-right font-normal">
											Amount
										</th>
									</tr>
								</thead>
							) : null}
							<tbody>
								{pageLines.map((line, index) => {
									const isLastOverall = rowOffset + index === lines.length - 1;
									return (
										<tr
											className={cn(
												"align-top",
												!isLastOverall && "border-[#ebebeb] border-b",
											)}
											key={`${line.plan_id ?? "custom"}-${line.feature_id ?? "base"}-${rowOffset + index}`}
										>
											<td className="break-all pt-[0.62em] pr-4 pb-[1.83em]">
												{cleanDescription(line.description)}
											</td>
											<td className="whitespace-nowrap pt-[0.62em] pr-[3.8em] pb-[1.83em] text-right tabular-nums">
												1
											</td>
											<td className="whitespace-nowrap pt-[0.62em] pb-[1.83em] text-right tabular-nums">
												{money({ amount: line.amount, currency })}
											</td>
											<td className="whitespace-nowrap pt-[0.62em] pl-[1.2em] pb-[1.83em] text-right tabular-nums">
												{money({ amount: line.amount, currency })}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>

						{isLast ? (
							<>
								<div className="ml-auto w-[50%]">
									<TotalRow
										label="Subtotal"
										value={money({ amount: preview.subtotal, currency })}
									/>
									{discountRows.map((row) => (
										<TotalRow
											key={row.label}
											label={row.label}
											value={`-${money({ amount: row.amount, currency })}`}
										/>
									))}
									{preview.tax ? (
										<TotalRow
											label={
												preview.tax.status === "complete"
													? "Tax"
													: "Tax (estimated)"
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
									<footer className="mt-[2.65em] whitespace-pre-wrap">
										{footer}
									</footer>
								) : null}
							</>
						) : null}
					</Page>
				);
			})}
		</div>
	);
}
