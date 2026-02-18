import type { AttachParamsV0, BillingResponse } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function useAttachMutation({
	customerId,
	buildRequestBody,
	onInvoiceCreated,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	buildRequestBody: (params?: {
		useInvoice?: boolean;
		enableProductImmediately?: boolean;
	}) => AttachParamsV0 | null;
	onInvoiceCreated?: (invoiceId: string) => void;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async ({
			useInvoice,
			enableProductImmediately,
		}: {
			useInvoice?: boolean;
			enableProductImmediately?: boolean;
		}) => {
			if (!customerId) {
				throw new Error("Customer ID is required");
			}

			const requestBody = buildRequestBody({
				useInvoice,
				enableProductImmediately,
			});

			if (!requestBody) {
				throw new Error("Failed to build request body");
			}

			const response = await axiosInstance.post<BillingResponse>(
				"/v1/billing.attach",
				requestBody,
			);

			return { data: response.data, useInvoice };
		},
		onSuccess: ({ data, useInvoice }) => {
			if (useInvoice) {
				if (data?.invoice) {
					onInvoiceCreated?.(data.invoice.stripe_id);
					toast.success("Invoice created successfully");
				}
			} else if (data?.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
				toast.success("Redirecting to complete payment...");
			} else {
				toast.success("Product attached successfully");
			}

			onSuccess?.();

			if (customerId) {
				queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
			}
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					"Failed to attach product",
			);
		},
	});

	const handleConfirm = () => {
		mutation.mutate({ useInvoice: false });
	};

	const handleInvoiceAttach = ({
		enableProductImmediately,
	}: {
		enableProductImmediately: boolean;
	}) => {
		mutation.mutate({
			useInvoice: true,
			enableProductImmediately,
		});
	};

	return {
		mutation,
		handleConfirm,
		handleInvoiceAttach,
		isPending: mutation.isPending,
	};
}
