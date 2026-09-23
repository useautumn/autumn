import {
	type CreateInvoicePreview,
	formatAmount,
	type Invoice,
	type InvoiceLineItem,
	InvoiceStatus,
} from "@autumn/shared";
import {
	Button,
	FormLabel,
	IconButton,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	SheetAccordion,
	SheetAccordionItem,
} from "@autumn/ui";
import { PaperPlaneTiltIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type Stripe from "stripe";
import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { getReissuePreviewState } from "./reissue/getReissuePreviewState";
import { ReissueBillingDetails } from "./reissue/ReissueBillingDetails";
import { stripeInvoiceToPrefill } from "./reissue/stripeInvoiceToPrefill";
import {
	buildReissuePayload,
	type ReissuePrefill,
	useReissueForm,
} from "./reissue/useReissueForm";

const NO_TEMPLATE = "none";

const RemoveButton = ({ onClick }: { onClick: () => void }) => (
	<IconButton
		variant="muted"
		size="sm"
		onClick={onClick}
		icon={<XIcon size={12} />}
		className="shrink-0 text-tertiary-foreground hover:text-red-500"
	/>
);

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
		<span className="text-form-label">{label}</span>
		{children}
		{hint && <span className="text-xs text-tertiary-foreground">{hint}</span>}
	</div>
);

export function ReissueInvoiceSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const invoice = sheetData?.invoice as Invoice | undefined;
	const axiosInstance = useAxiosInstance();

	const { data: stripeInvoice, isLoading } = useQuery({
		queryKey: ["stripe-invoice", invoice?.stripe_id],
		enabled: Boolean(invoice?.stripe_id),
		queryFn: async () => {
			const { data } = await axiosInstance.get<Stripe.Invoice>(
				`/v1/invoices/${invoice?.stripe_id}/stripe`,
			);
			return data;
		},
	});

	if (!invoice || isLoading) {
		return (
			<div className="flex h-full flex-col">
				<SheetHeader title="Reissue Invoice" description="Loading invoice..." />
				<div className="p-4 text-sm text-tertiary-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<ReissueInvoiceForm
			invoice={invoice}
			lineItems={(sheetData?.lineItems as InvoiceLineItem[] | undefined) ?? []}
			prefill={stripeInvoiceToPrefill(stripeInvoice)}
			invoiceDetailData={sheetData ?? {}}
		/>
	);
}

function ReissueInvoiceForm({
	invoice,
	lineItems,
	prefill,
	invoiceDetailData,
}: {
	invoice: Invoice;
	lineItems: InvoiceLineItem[];
	prefill: ReissuePrefill;
	invoiceDetailData: Record<string, unknown>;
}) {
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();
	const { customer, refetch } = useCusQuery();
	const { templates } = useInvoiceTemplatesQuery();
	const {
		form,
		patch,
		setAmount,
		toggleRemoved,
		addLine,
		updateAddedLine,
		removeAddedLine,
		addCustomField,
		updateCustomField,
		removeCustomField,
		setAddress,
	} = useReissueForm({ prefill });

	const payloadArgs = {
		invoiceId: invoice.id,
		form,
		prefill,
		lineItems,
	};
	const payload = buildReissuePayload(payloadArgs);
	const currentPreviewPayload = JSON.stringify(
		buildReissuePayload({ ...payloadArgs, preview: true }),
	);
	const previewPayload = useDebounce({
		value: currentPreviewPayload,
		delayMs: 500,
	});
	const {
		data: previewResult,
		isFetching: previewing,
		error: previewError,
	} = useQuery({
		queryKey: buildQueryKey(["reissue-preview", previewPayload]),
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post<{
				preview: CreateInvoicePreview;
			}>("/v1/invoices.reissue", JSON.parse(previewPayload), { signal });
			return { preview: data.preview, payload: previewPayload };
		},
		retry: false,
	});
	const previewState = getReissuePreviewState({
		form,
		prefill,
		currentPayload: currentPreviewPayload,
		debouncedPayload: previewPayload,
		successfulPayload: previewResult?.payload,
		isFetching: previewing,
		error: previewError ? getBackendErr(previewError, "Preview failed") : null,
	});

	const reissue = useMutation({
		mutationFn: async () => {
			if (!previewState.ready) {
				throw new Error("Wait for a successful preview before reissuing.");
			}
			const { data } = await axiosInstance.post(
				"/v1/invoices.reissue",
				payload,
			);
			return data;
		},
		onSuccess: async () => {
			toast.success("Invoice reissued");
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
			toast.error(getBackendErr(error, "Failed to reissue invoice"));
		},
	});

	const money = (amount: number) =>
		formatAmount({
			amount,
			currency: invoice.currency,
			minFractionDigits: 2,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});
	const isPaid = invoice.status === InvoiceStatus.Paid;
	const total =
		previewState.ready && previewResult
			? money(previewResult.preview.total)
			: null;
	const templateOptions = [
		{ label: "Keep current footer", value: NO_TEMPLATE },
		...templates.map((template) => ({
			label: template.name,
			value: template.id,
		})),
	];

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Reissue Invoice"
					description={
						isPaid
							? `Credit this ${money(invoice.total)} invoice to the customer's balance and send a corrected${total ? ` ${total}` : ""} invoice.`
							: `Send a new${total ? ` ${total}` : ""} invoice and void this one.`
					}
				/>

				<SheetSection withSeparator className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<FormLabel className="mb-0">Invoice items</FormLabel>
						<IconButton
							className="text-tertiary-foreground"
							icon={<PlusIcon size={12} />}
							onClick={addLine}
							size="sm"
							variant="muted"
						>
							Add
						</IconButton>
					</div>
					<div className="flex flex-col gap-2">
						{lineItems.map((lineItem) => {
							const removed = form.removedLineIds.includes(lineItem.id);
							return (
								<div
									key={lineItem.id}
									className={`flex items-center gap-2 ${removed ? "opacity-40" : ""}`}
								>
									<span
										className={`flex-1 truncate text-sm text-secondary-foreground ${removed ? "line-through" : ""}`}
										title={lineItem.description}
									>
										{lineItem.description}
									</span>
									<Input
										type="number"
										className="h-7 w-24 shrink-0 text-right text-xs"
										placeholder={String(lineItem.amount)}
										value={form.amounts[lineItem.id] ?? ""}
										disabled={removed}
										onChange={(e) => setAmount(lineItem.id, e.target.value)}
									/>
									<RemoveButton onClick={() => toggleRemoved(lineItem.id)} />
								</div>
							);
						})}
						{form.addedLines.map((line) => (
							<div key={line._id} className="flex items-center gap-2">
								<Input
									autoFocus={line.description === "" && line.amount === ""}
									className="h-7 flex-1 text-xs"
									placeholder="Description"
									value={line.description}
									onChange={(e) =>
										updateAddedLine(line._id, { description: e.target.value })
									}
								/>
								<Input
									type="number"
									className="h-7 w-24 shrink-0 text-right text-xs"
									placeholder="Amount"
									value={line.amount}
									onChange={(e) =>
										updateAddedLine(line._id, { amount: e.target.value })
									}
								/>
								<RemoveButton onClick={() => removeAddedLine(line._id)} />
							</div>
						))}
					</div>
					<span className="text-xs text-tertiary-foreground">
						Edit an amount to bill it differently, remove a line to leave it
						off, or add a custom charge.
					</span>
				</SheetSection>

				<ReissueBillingDetails
					form={form}
					prefill={prefill}
					patch={patch}
					setAddress={setAddress}
				/>

				<SheetAccordion type="multiple">
					<SheetAccordionItem value="settings" title="Invoice settings">
						<div className="space-y-4">
							<div className="space-y-1.5">
								<FormLabel>Invoice template</FormLabel>
								<Select
									value={form.templateId ?? NO_TEMPLATE}
									onValueChange={(value) =>
										patch({
											templateId: value === NO_TEMPLATE ? null : value,
										})
									}
									items={templateOptions}
								>
									<SelectTrigger className="w-full">
										<SelectValue>
											{templateOptions.find(
												(option) =>
													option.value === (form.templateId ?? NO_TEMPLATE),
											)?.label ?? "Keep current footer"}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{templateOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<FormLabel>Send to</FormLabel>
								<Input
									placeholder={
										customer?.email ?? "Leave empty to keep the same email"
									}
									value={form.email}
									onChange={(e) => patch({ email: e.target.value })}
								/>
								<span className="text-xs text-tertiary-foreground">
									Changes the customer's email in Stripe, so later invoices go
									there too.
								</span>
							</div>

							<div className="space-y-1.5">
								<FormLabel>Payment terms</FormLabel>
								<Input
									type="number"
									min={1}
									placeholder="Days until due — empty keeps the current terms"
									value={form.netTermsDays}
									onChange={(e) => patch({ netTermsDays: e.target.value })}
								/>
							</div>

							<Field label="Customer name">
								<Input
									aria-label="Customer name"
									value={form.customerName}
									onChange={(event) =>
										patch({ customerName: event.target.value })
									}
								/>
							</Field>
						</div>
					</SheetAccordionItem>
					<SheetAccordionItem value="invoice" title="This invoice">
						<div className="space-y-4">
							<Field label="Custom fields" hint="Up to four, e.g. a PO number.">
								<div className="flex flex-col gap-2">
									{form.customFields.map((field) => (
										<div key={field._id} className="flex items-center gap-2">
											<Input
												className="h-7 w-32 shrink-0 text-xs"
												placeholder="Name"
												maxLength={30}
												value={field.name}
												onChange={(e) =>
													updateCustomField(field._id, {
														name: e.target.value,
													})
												}
											/>
											<Input
												className="h-7 flex-1 text-xs"
												placeholder="Value"
												maxLength={30}
												value={field.value}
												onChange={(e) =>
													updateCustomField(field._id, {
														value: e.target.value,
													})
												}
											/>
											<RemoveButton
												onClick={() => removeCustomField(field._id)}
											/>
										</div>
									))}
									{form.customFields.length < 4 && (
										<div className="flex justify-end">
											<IconButton
												className="text-tertiary-foreground"
												icon={<PlusIcon size={12} />}
												onClick={addCustomField}
												size="sm"
												variant="muted"
											>
												Add
											</IconButton>
										</div>
									)}
								</div>
							</Field>
							<Field label="Memo">
								<Input
									placeholder="Keep the current memo"
									value={form.memo}
									onChange={(e) => patch({ memo: e.target.value })}
								/>
							</Field>
							<Field label="Footer">
								<Input
									placeholder="Keep the current footer"
									value={form.footer}
									onChange={(e) => patch({ footer: e.target.value })}
								/>
							</Field>
						</div>
					</SheetAccordionItem>
				</SheetAccordion>
				<PreviewSection
					includeNextCycle={false}
					showCreditNote={false}
					previewQuery={{
						isLoading: !previewState.ready && !previewState.error,
						error: previewState.error ? new Error(previewState.error) : null,
						data:
							previewState.ready && previewResult
								? {
										...previewResult.preview,
										line_items: [],
										tax: previewResult.preview.tax ?? undefined,
									}
								: null,
					}}
				/>

				<SheetFooter className="pt-4">
					<Button
						variant="secondary"
						className="w-full"
						onClick={() =>
							setSheet({ type: "invoice-detail", data: invoiceDetailData })
						}
						disabled={reissue.isPending}
					>
						Back
					</Button>
					<Button
						variant="primary"
						className="w-full"
						onClick={() => reissue.mutate()}
						isLoading={reissue.isPending}
						disabled={!previewState.ready || reissue.isPending}
					>
						<PaperPlaneTiltIcon size={16} />
						{previewState.recalculating
							? "Recalculating…"
							: `Reissue${total ? ` ${total}` : ""}`}
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
