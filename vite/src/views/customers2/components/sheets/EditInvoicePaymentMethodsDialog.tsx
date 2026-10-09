import {
	formatAmount,
	type Invoice,
	type InvoicePaymentMethod,
} from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type Stripe from "stripe";
import { useOrgPaymentMethodTypes } from "@/components/forms/shared/hooks/useOrgPaymentMethodTypes";
import { PaymentMethodTypesSelect } from "@/components/forms/shared/PaymentMethodTypesSelect";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export function EditInvoicePaymentMethodsDialog({
	open,
	onOpenChange,
	invoice,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	invoice: Invoice;
	onSaved: () => Promise<unknown>;
}) {
	const axiosInstance = useAxiosInstance();
	const orgPaymentMethodTypes = useOrgPaymentMethodTypes();
	const [paymentMethodTypes, setPaymentMethodTypes] = useState<
		InvoicePaymentMethod[] | null
	>(null);

	// Unsaved edits must never carry over to another invoice or a reopened dialog.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on these on purpose
	useEffect(() => setPaymentMethodTypes(null), [open, invoice.id]);

	const {
		data: stripeInvoice,
		isFetching,
		isError,
		refetch: refetchStripeInvoice,
	} = useQuery({
		queryKey: ["stripe-invoice", invoice.stripe_id],
		enabled: open,
		queryFn: async () => {
			const { data } = await axiosInstance.get<Stripe.Invoice>(
				`/v1/invoices/${invoice.stripe_id}/stripe`,
			);
			return data;
		},
	});

	const invoicePaymentMethodTypes = stripeInvoice?.payment_settings
		?.payment_method_types as InvoicePaymentMethod[] | null | undefined;
	// Without the live invoice we'd overwrite its methods with unrelated org defaults.
	const value = !stripeInvoice
		? null
		: (paymentMethodTypes ??
			(invoicePaymentMethodTypes?.length
				? invoicePaymentMethodTypes
				: orgPaymentMethodTypes));

	const updateInvoice = useMutation({
		mutationFn: () =>
			axiosInstance.post("/v1/invoices.update", {
				invoice_id: invoice.id,
				payment_method_types: value,
			}),
		onSuccess: async () => {
			toast.success("Payment methods updated");
			onOpenChange(false);
			setPaymentMethodTypes(null);
			await Promise.all([onSaved(), refetchStripeInvoice()]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update payment methods"));
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
					<DialogTitle>Edit payment methods</DialogTitle>
					<DialogDescription>
						Choose how the customer can pay this {formattedTotal} invoice.
						Changes show on the hosted invoice page straight away.
					</DialogDescription>
				</DialogHeader>

				<PaymentMethodTypesSelect
					value={value}
					onValueChange={setPaymentMethodTypes}
					disabled={isFetching || isError}
				/>
				{isError && (
					<p className="text-sm text-destructive">
						Couldn't load this invoice from Stripe. Close the dialog and try
						again.
					</p>
				)}

				<DialogFooter>
					<Button
						variant="primary"
						className="w-full"
						onClick={() => updateInvoice.mutate()}
						isLoading={updateInvoice.isPending}
						disabled={isFetching || isError || !value?.length}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
