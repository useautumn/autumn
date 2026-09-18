import type {
	CreateInvoiceParams,
	CreateInvoiceResponse,
} from "@autumn/shared";
import { toast } from "sonner";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";

const copyLink = async (url: string) => {
	try {
		await navigator.clipboard.writeText(url);
		return true;
	} catch {
		return false;
	}
};

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
		const url = result.data?.invoice?.hosted_invoice_url;
		const copied = url ? await copyLink(url) : false;

		toast.success(
			copied ? "Invoice created, link copied to clipboard" : "Invoice created",
		);

		onCreated?.();
	};

	return { ...mutation, createInvoice };
}
