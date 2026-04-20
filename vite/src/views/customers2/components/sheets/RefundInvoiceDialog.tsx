import { formatAmount, type Invoice } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

type RefundMode = "full" | "partial";

const REFUND_MODE_OPTIONS: RefundMode[] = ["full", "partial"];

export function RefundInvoiceDialog({
	open,
	onOpenChange,
	invoice,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	invoice: Invoice;
}) {
	const [mode, setMode] = useState<RefundMode>("full");
	const [amount, setAmount] = useState("");
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();

	const customerId = customer?.id || customer?.internal_id;

	const refundMutation = useMutation({
		mutationFn: async () => {
			const body: { mode: RefundMode; amount?: number } = { mode };
			if (mode === "partial" && amount) {
				body.amount = Number.parseFloat(amount);
			}

			const { data } = await axiosInstance.post(
				`/v1/customers/${customerId}/invoices/${invoice.stripe_id}/refund`,
				body,
			);
			return data;
		},
		onSuccess: async () => {
			toast.success("Refund issued successfully");
			onOpenChange(false);
			setMode("full");
			setAmount("");
			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey(["customer", customerId]),
				}),
			]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to issue refund"));
		},
	});

	const refundableAmount = Math.abs(invoice.amount_paid ?? invoice.total);

	const handleSubmit = () => {
		if (mode === "partial") {
			const parsed = Number.parseFloat(amount);
			if (!amount || Number.isNaN(parsed) || parsed <= 0) {
				toast.error("Please enter a valid refund amount");
				return;
			}
			if (parsed > refundableAmount) {
				toast.error("Refund amount cannot exceed the amount paid");
				return;
			}
		}
		refundMutation.mutate();
	};

	const formattedRefundable = formatAmount({
		amount: refundableAmount,
		currency: invoice.currency,
		minFractionDigits: 2,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Refund Invoice</DialogTitle>
					<DialogDescription>
						Amount paid: {formattedRefundable} {invoice.currency.toUpperCase()}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<span className="text-sm font-medium text-foreground">
							Refund type
						</span>
						<SearchableSelect<RefundMode>
							value={mode}
							onValueChange={(value) => setMode(value as RefundMode)}
							options={REFUND_MODE_OPTIONS}
							getOptionValue={(option) => option}
							getOptionLabel={(option) =>
								option === "full" ? "Full" : "Partial"
							}
						/>
					</div>

					{mode === "partial" && (
						<div className="flex flex-col gap-1.5">
							<span className="text-sm font-medium text-foreground">
								Refund amount ({invoice.currency.toUpperCase()})
							</span>
							<Input
								type="number"
								min="0.01"
								step="0.01"
								max={refundableAmount}
								placeholder="0.00"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
							/>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={refundMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSubmit}
						isLoading={refundMutation.isPending}
					>
						Refund
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
