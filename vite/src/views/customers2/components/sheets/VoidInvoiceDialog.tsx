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

export function VoidInvoiceDialog({
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

	const voidMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post("/v1/invoices.void", {
				invoice_id: invoice.id,
			});
			return data;
		},
		onSuccess: async () => {
			toast.success("Invoice voided");
			onOpenChange(false);
			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey(["customer", customerId]),
				}),
			]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to void invoice"));
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
					<DialogTitle>Void Invoice</DialogTitle>
					<DialogDescription>
						This cancels the {formattedTotal} {invoice.currency.toUpperCase()}{" "}
						invoice so it can no longer be paid. Any plan waiting on this
						invoice will expire. This cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<ShortcutButton
						variant="destructive"
						className="w-full"
						onClick={() => voidMutation.mutate()}
						isLoading={voidMutation.isPending}
						metaShortcut="enter"
					>
						Void Invoice
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
