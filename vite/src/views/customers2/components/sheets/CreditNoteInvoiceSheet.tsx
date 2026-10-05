import {
	type ApiCreditNote,
	type CreditNoteDestination,
	formatAmount,
	type Invoice,
	type InvoiceLineItem,
	InvoiceStatus,
	type IssueCreditNoteParams,
} from "@autumn/shared";
import {
	Button,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { ReceiptXIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

type CreditMode = "amount" | "lines";

const NO_REASON = "none";

const DESTINATION_LABELS: Record<CreditNoteDestination, string> = {
	customer_balance: "Customer balance",
	refund: "Refund to payment method",
	out_of_band: "Paid back outside Stripe",
};

const REASON_LABELS: Record<string, string> = {
	[NO_REASON]: "No reason",
	duplicate: "Duplicate",
	fraudulent: "Fraudulent",
	order_change: "Order change",
	product_unsatisfactory: "Product unsatisfactory",
};

const MODE_LABELS: Record<CreditMode, string> = {
	amount: "Flat amount",
	lines: "Specific lines",
};

const EMAIL_LABELS = { yes: "Send the credit note", no: "Don't send" };

const Field = ({
	label,
	children,
	hint,
}: {
	label: string;
	children: React.ReactNode;
	hint?: string;
}) => (
	<div className="flex flex-col gap-1.5">
		<FormLabel className="mb-0">{label}</FormLabel>
		{children}
		{hint && <span className="text-xs text-tertiary-foreground">{hint}</span>}
	</div>
);

const parsePositive = (value: string) => {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function CreditNoteInvoiceSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const invoice = sheetData?.invoice as Invoice | undefined;
	if (!invoice) return null;

	return (
		<CreditNoteForm
			invoice={invoice}
			lineItems={(sheetData?.lineItems as InvoiceLineItem[] | undefined) ?? []}
			invoiceDetailData={sheetData ?? {}}
		/>
	);
}

function CreditNoteForm({
	invoice,
	lineItems,
	invoiceDetailData,
}: {
	invoice: Invoice;
	lineItems: InvoiceLineItem[];
	invoiceDetailData: Record<string, unknown>;
}) {
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();
	const { customer, refetch } = useCusQuery();

	const creditableLines = lineItems.filter((line) => line.stripe_id);
	const isPaid = invoice.status === InvoiceStatus.Paid;

	const [mode, setMode] = useState<CreditMode>("amount");
	const [amount, setAmount] = useState("");
	const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
	const [destination, setDestination] =
		useState<CreditNoteDestination>("customer_balance");
	const [reason, setReason] = useState(NO_REASON);
	const [memo, setMemo] = useState("");
	const [sendEmail, setSendEmail] = useState(true);

	const lines = Object.entries(lineAmounts).flatMap(([id, value]) => {
		const lineAmount = parsePositive(value);
		return lineAmount ? [{ id, amount: lineAmount }] : [];
	});
	const flatAmount = parsePositive(amount);
	const hasCredit = mode === "amount" ? flatAmount !== null : lines.length > 0;

	const payload: IssueCreditNoteParams = {
		invoice_id: invoice.id,
		...(mode === "amount" ? { amount: flatAmount ?? undefined } : { lines }),
		destination,
		send_email: sendEmail,
		reason:
			reason === NO_REASON
				? undefined
				: (reason as IssueCreditNoteParams["reason"]),
		memo: memo || undefined,
	};
	const currentPreviewPayload = JSON.stringify({ ...payload, preview: true });
	const previewPayload = useDebounce({
		value: currentPreviewPayload,
		delayMs: 500,
	});

	const {
		data: preview,
		isFetching: previewing,
		error: previewError,
	} = useQuery({
		queryKey: buildQueryKey(["credit-note-preview", previewPayload]),
		enabled: hasCredit,
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post<{
				credit_note: ApiCreditNote;
			}>("/v1/invoices.issue_credit_note", JSON.parse(previewPayload), {
				signal,
			});
			return data.credit_note;
		},
		retry: false,
	});

	const issue = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<{
				credit_note: ApiCreditNote;
			}>("/v1/invoices.issue_credit_note", payload);
			return data.credit_note;
		},
		onSuccess: async (creditNote) => {
			toast.success(`Credit note ${creditNote.number ?? ""} issued`.trim());
			closeSheet();
			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey([
						"customer",
						customer?.id || customer?.internal_id,
					]),
				}),
			]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to issue credit note"));
		},
	});

	const money = (value: number) =>
		formatAmount({
			amount: value,
			currency: invoice.currency,
			minFractionDigits: 2,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});
	const previewReady =
		hasCredit &&
		!previewing &&
		Boolean(preview) &&
		previewPayload === currentPreviewPayload;
	const previewErrorText = previewError
		? getBackendErr(previewError, "Preview failed")
		: null;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<SheetHeader
				title="Issue Credit Note"
				description={
					isPaid
						? `Credit part or all of this paid ${money(invoice.total)} invoice. The credited money goes to the destination you pick.`
						: `Reduce what the customer still owes on this ${money(invoice.total)} invoice.`
				}
			/>

			<SheetSection withSeparator className="flex flex-col gap-3">
				<Field label="Credit">
					<Select
						value={mode}
						onValueChange={(value) => setMode(value as CreditMode)}
						items={MODE_LABELS}
					>
						<SelectTrigger className="w-full">
							<SelectValue>{MODE_LABELS[mode]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="amount">{MODE_LABELS.amount}</SelectItem>
							<SelectItem value="lines" disabled={creditableLines.length === 0}>
								{MODE_LABELS.lines}
							</SelectItem>
						</SelectContent>
					</Select>
				</Field>

				{mode === "amount" ? (
					<Field
						label={`Amount (${invoice.currency.toUpperCase()})`}
						hint="The credit note's final total."
					>
						<Input
							aria-label="Credit amount"
							type="number"
							min="0.01"
							step="0.01"
							placeholder="0.00"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
						/>
					</Field>
				) : (
					<Field
						label="Lines to credit"
						hint="Enter up to what each line charged, minus earlier credits. Amounts are before discount and tax."
					>
						<div className="flex flex-col gap-2">
							{creditableLines.map((line) => (
								<div key={line.id} className="flex items-center gap-2">
									<div className="flex min-w-0 flex-1 flex-col">
										<span
											className="truncate text-sm text-secondary-foreground"
											title={line.description}
										>
											{line.description}
										</span>
										<span className="text-xs tabular-nums text-tertiary-foreground">
											Charged {money(line.amount)}
										</span>
									</div>
									<Input
										type="number"
										aria-label={`Credit for ${line.description}`}
										className="h-7 w-24 shrink-0 text-right text-xs"
										placeholder="0.00"
										value={lineAmounts[line.id] ?? ""}
										onChange={(e) =>
											setLineAmounts((current) => ({
												...current,
												[line.id]: e.target.value,
											}))
										}
									/>
								</div>
							))}
						</div>
					</Field>
				)}

				{isPaid && (
					<Field label="Send credited money to">
						<Select
							value={destination}
							onValueChange={(value) =>
								setDestination(value as CreditNoteDestination)
							}
							items={DESTINATION_LABELS}
						>
							<SelectTrigger className="w-full">
								<SelectValue>{DESTINATION_LABELS[destination]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{Object.entries(DESTINATION_LABELS).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				)}

				<Field label="Reason">
					<Select
						value={reason}
						onValueChange={(value) => setReason(value as string)}
						items={REASON_LABELS}
					>
						<SelectTrigger className="w-full">
							<SelectValue>{REASON_LABELS[reason]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{Object.entries(REASON_LABELS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>

				<Field label="Memo">
					<Input
						placeholder="Shown on the credit note PDF"
						value={memo}
						onChange={(e) => setMemo(e.target.value)}
					/>
				</Field>

				<Field label="Email customer">
					<Select
						value={sendEmail ? "yes" : "no"}
						onValueChange={(value) => setSendEmail(value === "yes")}
						items={EMAIL_LABELS}
					>
						<SelectTrigger className="w-full">
							<SelectValue>
								{sendEmail ? EMAIL_LABELS.yes : EMAIL_LABELS.no}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="yes">{EMAIL_LABELS.yes}</SelectItem>
							<SelectItem value="no">{EMAIL_LABELS.no}</SelectItem>
						</SelectContent>
					</Select>
				</Field>
			</SheetSection>

			{hasCredit && (
				<SheetSection withSeparator={false} className="flex flex-col gap-1.5">
					<FormLabel className="mb-0">Preview</FormLabel>
					{previewErrorText ? (
						<span className="text-sm text-red-500">{previewErrorText}</span>
					) : !previewReady || !preview ? (
						<span className="text-sm text-tertiary-foreground">
							Calculating…
						</span>
					) : (
						<div className="flex flex-col gap-1 text-sm">
							<PreviewRow label="Subtotal" value={money(preview.subtotal)} />
							{preview.discount_amount > 0 && (
								<PreviewRow
									label="Discount"
									value={`-${money(preview.discount_amount)}`}
								/>
							)}
							{preview.tax_amount > 0 && (
								<PreviewRow label="Tax" value={money(preview.tax_amount)} />
							)}
							<PreviewRow
								label="Total credited"
								value={money(preview.total)}
								strong
							/>
							{preview.pre_payment_amount > 0 && (
								<PreviewRow
									label="Off the amount due"
									value={money(preview.pre_payment_amount)}
								/>
							)}
							{preview.post_payment_amount > 0 && (
								<PreviewRow
									label={DESTINATION_LABELS[destination]}
									value={money(preview.post_payment_amount)}
								/>
							)}
						</div>
					)}
				</SheetSection>
			)}

			<SheetFooter className="sticky bottom-0 mt-auto border-t bg-card pt-4 dark:border-[#1F1F1F] dark:bg-[#141414]">
				<Button
					variant="secondary"
					className="w-full"
					onClick={() =>
						setSheet({ type: "invoice-detail", data: invoiceDetailData })
					}
					disabled={issue.isPending}
				>
					Back
				</Button>
				<Button
					variant="primary"
					className="w-full"
					onClick={() => issue.mutate()}
					isLoading={issue.isPending}
					disabled={!previewReady || Boolean(previewErrorText)}
				>
					<ReceiptXIcon size={16} />
					{previewReady && preview
						? `Issue credit note ${money(preview.total)}`
						: "Issue credit note"}
				</Button>
			</SheetFooter>
		</div>
	);
}

function PreviewRow({
	label,
	value,
	strong,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className={strong ? "text-foreground" : "text-tertiary-foreground"}>
				{label}
			</span>
			<span
				className={`tabular-nums ${strong ? "font-medium text-foreground" : "text-secondary-foreground"}`}
			>
				{value}
			</span>
		</div>
	);
}
