import { formatAmount, type Invoice } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function ReissueInvoiceDialog({
	open,
	onOpenChange,
	invoice,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	invoice: Invoice;
}) {
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();

	const customerId = customer?.id || customer?.internal_id;

	const reissueMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post("/v1/invoices.reissue", {
				invoice_id: invoice.id,
			});
			return data;
		},
		onSuccess: async () => {
			toast.success("Invoice reissued");
			onOpenChange(false);
			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey(["customer", customerId]),
				}),
			]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to reissue invoice"));
		},
	});

	const formattedTotal = formatAmount({
		amount: invoice.total,
		currency: invoice.currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Reissue Invoice</DialogTitle>
					<DialogDescription>
						This sends a new {formattedTotal} {invoice.currency.toUpperCase()}{" "}
						invoice with the same charges and voids this one. No money moves,
						and the customer pays the replacement instead.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<ShortcutButton
						variant="primary"
						className="w-full"
						onClick={() => reissueMutation.mutate()}
						isLoading={reissueMutation.isPending}
						metaShortcut="enter"
					>
						Reissue Invoice
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
