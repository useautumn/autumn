import type {
	CreateInvoiceParams,
	CreateInvoiceResponse,
} from "@autumn/shared";
import { toast } from "sonner";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";

export function useCreateInvoiceMutation({
	customerId,
	buildRequestBody,
	onCreated,
}: {
	customerId: string | undefined;
	buildRequestBody: () => CreateInvoiceParams | null;
	onCreated?: () => void;
}) {
	const mutation = useBillingMutation<
		CreateInvoiceParams,
		CreateInvoiceResponse & { payment_url?: null }
	>({
		customerId,
		path: "/v1/invoices.create",
		buildRequestBody,
		successMessage: "Invoice created",
		errorMessage: "Failed to create invoice",
	});

	const createInvoice = async () => {
		const result = await mutation.mutateAsync({
			useInvoice: true,
			skipDefaultSuccess: true,
		});
		const invoice = result.data?.invoice;

		if (invoice?.hosted_invoice_url) {
			await navigator.clipboard.writeText(invoice.hosted_invoice_url);
			toast.success("Invoice created, link copied to clipboard");
		} else {
			toast.success("Invoice created");
		}

		onCreated?.();
	};

	return { ...mutation, createInvoice };
}
