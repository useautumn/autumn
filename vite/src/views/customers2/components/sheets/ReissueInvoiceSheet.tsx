import { formatAmount, type Invoice } from "@autumn/shared";
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

	const invoice = sheetData?.invoice as Invoice | undefined;
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

	const reissue = useMutation({
		mutationFn: async () => {
			if (!invoice) return;
			const trimmedEmail = email.trim();
			const { data } = await axiosInstance.post("/v1/invoices.reissue", {
				invoice_id: invoice.id,
				...(templateId !== NO_TEMPLATE
					? { invoice_template_id: templateId }
					: {}),
				...(trimmedEmail ? { update_customer_email: trimmedEmail } : {}),
				...(netTermsDays ? { net_terms_days: Number(netTermsDays) } : {}),
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
	const invalidNetTerms =
		netTermsDays !== "" &&
		(!Number.isInteger(Number(netTermsDays)) || Number(netTermsDays) < 1);

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Reissue Invoice"
					description={`Send a new ${formattedTotal} invoice and void this one. No money moves.`}
					breadcrumbs={[{ name: "Invoice", sheet: "invoice-detail" }]}
					itemId={invoice.id}
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

				<SheetSection withSeparator={false}>
					<FormLabel>Payment terms</FormLabel>
					<Input
						type="number"
						min={1}
						placeholder="Days until due — empty keeps the current terms"
						value={netTermsDays}
						onChange={(e) => setNetTermsDays(e.target.value)}
					/>
				</SheetSection>

				<SheetFooter className="pt-4">
					<Button
						variant="secondary"
						className="w-full"
						onClick={() =>
							setSheet({ type: "invoice-detail", data: { invoice } })
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
