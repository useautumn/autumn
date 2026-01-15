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
			return { data: response.data, useInvoice };
		},
		onSuccess: ({ data, useInvoice }) => {
			if (useInvoice) {
				// Invoice flow: redirect to Stripe invoice page
				if (data?.invoice) {
					onInvoiceCreated?.(data.invoice.stripe_id);
					toast.success("Invoice created successfully");
				}
			} else {
				// Confirm update flow: only redirect if payment_url exists (payment method required)
				if (data?.payment_url) {
					onCheckoutRedirect?.(data.payment_url);
					toast.success("Redirecting to complete payment...");
				} else {
					toast.success("Subscription updated successfully");
				}
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
