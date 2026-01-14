import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormContext";

export function useUpdateSubscriptionMutation({
	updateSubscriptionFormContext,
	buildRequestBody,
	onInvoiceCreated,
	onCheckoutRedirect,
	onSuccess,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	buildRequestBody: () => Record<string, unknown>;
	onInvoiceCreated?: (invoiceId: string) => void;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const { customerId } = updateSubscriptionFormContext;
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

			const requestBody = buildRequestBody();

			if (useInvoice) {
				requestBody.invoice = true;
				requestBody.enable_product_immediately = enableProductImmediately;
				requestBody.finalize_invoice = false;
				if (enableProductImmediately === false) {
					requestBody.force_checkout = true;
				}
			}

			const response = await axiosInstance.post(
				"/v1/subscriptions/update",
				requestBody,
			);
			return response.data;
		},
		onSuccess: (data) => {
			if (data?.invoice) {
				onInvoiceCreated?.(data.invoice);
				toast.success("Invoice created successfully");
			} else if (data?.checkout_url) {
				onCheckoutRedirect?.(data.checkout_url);
				toast.success("Redirecting to checkout...");
			} else {
				toast.success("Subscription updated successfully");
			}

			onSuccess?.();

			if (customerId) {
				queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
			}
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					"Failed to update subscription",
			);
		},
	});

	const handleConfirm = () => {
		mutation.mutate({ useInvoice: false });
	};

	const handleInvoiceUpdate = ({
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
		handleInvoiceUpdate,
		isPending: mutation.isPending,
	};
}
