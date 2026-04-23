import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function useUpdateSubscriptionMutation({
	updateSubscriptionFormContext,
	buildRequestBody,
	onCheckoutRedirect,
	onSuccess,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	buildRequestBody: () => Record<string, unknown>;
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
			finalizeInvoice,
		}: {
			useInvoice?: boolean;
			enableProductImmediately?: boolean;
			finalizeInvoice?: boolean;
		}) => {
			if (!customerId) {
				throw new Error("Customer ID is required");
			}

			const requestBody = buildRequestBody();

			if (useInvoice) {
				requestBody.invoice = true;
				requestBody.enable_product_immediately = enableProductImmediately;
				requestBody.finalize_invoice = finalizeInvoice ?? false;
				if (enableProductImmediately === false) {
					requestBody.force_checkout = true;
				}
			}

			const response = await axiosInstance.post(
				"/v1/billing.update",
				requestBody,
			);
			return { data: response.data, useInvoice };
		},
		onSuccess: ({ data, useInvoice }) => {
			if (useInvoice) {
				if (data?.invoice) {
					toast.success("Invoice created successfully");
				}
			} else if (data?.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
				toast.success("Redirecting to complete payment...");
			} else {
				toast.success("Subscription updated successfully");
			}

			if (!useInvoice) {
				onSuccess?.();
			}

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

	const handleInvoiceUpdate = async ({
		enableProductImmediately,
		finalizeInvoice,
	}: {
		enableProductImmediately: boolean;
		finalizeInvoice: boolean;
	}) => {
		const result = await mutation.mutateAsync({
			useInvoice: true,
			enableProductImmediately,
			finalizeInvoice,
		});
		return {
			stripeId: result.data?.invoice?.stripe_id,
			hostedInvoiceUrl: result.data?.invoice?.hosted_invoice_url,
		};
	};

	return {
		mutation,
		handleConfirm,
		handleInvoiceUpdate,
		isPending: mutation.isPending,
	};
}
