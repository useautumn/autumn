import {
	formatAmount,
	type Invoice,
	type InvoiceLineItem,
	InvoiceStatus,
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
	Switch,
} from "@autumn/ui";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const NO_TEMPLATE = "none";

export function ReissueInvoiceSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();
	const { customer, refetch } = useCusQuery();
	const { templates } = useInvoiceTemplatesQuery();

	// The whole invoice-detail payload rides along so Back restores that sheet intact.
	const invoice = sheetData?.invoice as Invoice | undefined;
	const lineItems =
		(sheetData?.lineItems as InvoiceLineItem[] | undefined) ?? [];
	const taxedAmount = sheetData?.taxedAmount as number | undefined;
	const invoiceDetailData = sheetData ?? {};
	const templateOptions = [
		{ label: "Keep current footer", value: NO_TEMPLATE },
		...templates.map((template) => ({
			label: template.name,
			value: template.id,
		})),
	];
	const [templateId, setTemplateId] = useState(NO_TEMPLATE);
	const [email, setEmail] = useState("");
	const [netTermsDays, setNetTermsDays] = useState("");
	const [removeTax, setRemoveTax] = useState(false);
	// Keyed by line item id; only the ones the user actually touched are sent.
	const [amounts, setAmounts] = useState<Record<string, string>>({});

	const reissue = useMutation({
		mutationFn: async () => {
			if (!invoice) return;
			const trimmedEmail = email.trim();
			const invoiceOverrides = removeTax ? { tax_rate_id: null } : {};
			const updatedLines = Object.entries(amounts).flatMap(([id, value]) =>
				value.trim() === "" ? [] : [{ id, amount: Number(value) }],
			);

			const { data } = await axiosInstance.post("/v1/invoices.reissue", {
				invoice_id: invoice.id,
				...(templateId !== NO_TEMPLATE
					? { invoice_template_id: templateId }
					: {}),
				...(trimmedEmail ? { update_customer_email: trimmedEmail } : {}),
				...(netTermsDays ? { net_terms_days: Number(netTermsDays) } : {}),
				...(Object.keys(invoiceOverrides).length
					? { invoice: invoiceOverrides }
					: {}),
				...(updatedLines.length ? { lines: { update: updatedLines } } : {}),
			});
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

	if (!invoice) {
		return (
			<div className="flex h-full flex-col">
				<SheetHeader title="Reissue Invoice" description="Loading invoice..." />
				<div className="p-4 text-sm text-tertiary-foreground">Loading...</div>
			</div>
		);
	}

	const formattedTotal = formatAmount({
		amount: invoice.total,
		currency: invoice.currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
	const isPaid = invoice.status === InvoiceStatus.Paid;
	// taxedAmount is the tax itself, and the detail sheet only receives one for
	// orgs on Stripe automatic tax.
	const isTaxed = (taxedAmount ?? 0) > 0;
	const formattedTax = formatAmount({
		amount: taxedAmount ?? 0,
		currency: invoice.currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
	const invalidNetTerms =
		netTermsDays !== "" &&
		(!Number.isInteger(Number(netTermsDays)) || Number(netTermsDays) < 1);

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Reissue Invoice"
					description={
						isPaid
							? `Credit this ${formattedTotal} invoice to the customer's balance and send a corrected one, which that balance covers.`
							: `Send a new ${formattedTotal} invoice and void this one.`
					}
				/>

				<SheetSection withSeparator>
					<FormLabel>Invoice template</FormLabel>
					<Select
						value={templateId}
						onValueChange={setTemplateId}
						items={templateOptions}
					>
						<SelectTrigger className="w-full">
							<SelectValue>
								{templateOptions.find((option) => option.value === templateId)
									?.label ?? "Keep current footer"}
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
				</SheetSection>

				<SheetSection withSeparator>
					<FormLabel>Send to</FormLabel>
					<Input
						placeholder={
							customer?.email ?? "Leave empty to keep the same email"
						}
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<span className="text-xs text-tertiary-foreground">
						Changes the customer's email in Stripe, so later invoices go there
						too.
					</span>
				</SheetSection>

				<SheetSection withSeparator={isTaxed || lineItems.length > 0}>
					<FormLabel>Payment terms</FormLabel>
					<Input
						type="number"
						min={1}
						placeholder="Days until due — empty keeps the current terms"
						value={netTermsDays}
						onChange={(e) => setNetTermsDays(e.target.value)}
					/>
				</SheetSection>

				{isTaxed && (
					<SheetSection withSeparator={lineItems.length > 0}>
						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">Reissue without tax</FormLabel>
							<Switch checked={removeTax} onCheckedChange={setRemoveTax} />
						</div>
						<span className="text-xs text-tertiary-foreground">
							Drops the {formattedTax} of tax on this invoice.
						</span>
					</SheetSection>
				)}

				{lineItems.length > 0 && (
					<SheetSection withSeparator={false}>
						<FormLabel>Line amounts</FormLabel>
						<div className="flex flex-col gap-2">
							{lineItems.map((lineItem) => (
								<div
									key={lineItem.id}
									className="flex items-center justify-between gap-3"
								>
									<span
										className="truncate text-sm text-secondary-foreground"
										title={lineItem.description}
									>
										{lineItem.description}
									</span>
									<Input
										type="number"
										className="w-28 shrink-0"
										placeholder={String(lineItem.amount)}
										value={amounts[lineItem.id] ?? ""}
										onChange={(e) =>
											setAmounts((current) => ({
												...current,
												[lineItem.id]: e.target.value,
											}))
										}
									/>
								</div>
							))}
						</div>
						<span className="text-xs text-tertiary-foreground">
							Leave a line empty to bill it unchanged.
						</span>
					</SheetSection>
				)}

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
						disabled={invalidNetTerms}
					>
						<PaperPlaneTiltIcon size={16} />
						Reissue
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
