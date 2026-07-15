import type { AttachParamsV0, BillingResponse } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { invalidateCustomerBillingQueries } from "@/components/forms/shared/utils/invalidateCustomerBillingQueries";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function useAttachMutation({
	customerId,
	buildRequestBody,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	buildRequestBody: (params?: {
		useInvoice?: boolean;
		enableProductImmediately?: boolean;
		finalizeInvoice?: boolean;
		invoiceTemplateId?: string;
		netTermsDays?: number;
		longLivedCheckout?: boolean;
	}) => AttachParamsV0 | null;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async ({
			useInvoice,
			enableProductImmediately,
			finalizeInvoice,
			invoiceTemplateId,
			netTermsDays,
			longLivedCheckout,
			skipDefaultSuccess,
		}: {
			useInvoice?: boolean;
			enableProductImmediately?: boolean;
			finalizeInvoice?: boolean;
			invoiceTemplateId?: string;
			netTermsDays?: number;
			longLivedCheckout?: boolean;
			skipDefaultSuccess?: boolean;
		}) => {
			if (!customerId) {
				throw new Error("Customer ID is required");
			}

			const requestBody = buildRequestBody({
				useInvoice,
				enableProductImmediately,
				finalizeInvoice,
				invoiceTemplateId,
				netTermsDays,
				longLivedCheckout,
			});

			if (!requestBody) {
				throw new Error("Failed to build request body");
			}

			const response = await axiosInstance.post<BillingResponse>(
				"/v1/billing.attach",
				requestBody,
			);

			return { data: response.data, useInvoice, skipDefaultSuccess };
		},
		onSuccess: ({ data, useInvoice, skipDefaultSuccess }) => {
			if (skipDefaultSuccess) {
				invalidateCustomerBillingQueries({ queryClient, customerId });
				return;
			}

			if (useInvoice) {
				if (data?.invoice) {
					toast.success("Invoice created successfully");
				} else {
					// Invoice-mode subscription with no immediate invoice (usage-in-arrears):
					// nothing to send now, so confirm and close instead of dead-ending.
					toast.success("Subscription started");
					onSuccess?.();
				}
			} else if (data?.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
			} else {
				toast.success("Product attached successfully");
			}

			if (!useInvoice) {
				onSuccess?.();
			}

			invalidateCustomerBillingQueries({ queryClient, customerId });
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					"Failed to attach product",
			);
		},
	});

	const handleConfirm = ({
		enableProductImmediately,
	}: {
		enableProductImmediately?: boolean;
	} = {}) => {
		mutation.mutate({ useInvoice: false, enableProductImmediately });
	};

	const handleInvoiceAttach = async ({
		enableProductImmediately,
		finalizeInvoice,
		invoiceTemplateId,
		netTermsDays,
	}: {
		enableProductImmediately: boolean;
		finalizeInvoice: boolean;
		invoiceTemplateId?: string;
		netTermsDays?: number;
	}) => {
		const result = await mutation.mutateAsync({
			useInvoice: true,
			enableProductImmediately,
			finalizeInvoice,
			invoiceTemplateId,
			netTermsDays,
		});
		return {
			stripeId: result.data?.invoice?.stripe_id,
			hostedInvoiceUrl: result.data?.invoice?.hosted_invoice_url,
		};
	};

	const handleCheckoutAttach = async ({
		longLivedCheckout,
	}: {
		longLivedCheckout?: boolean;
	} = {}) => {
		const result = await mutation.mutateAsync({
			useInvoice: false,
			longLivedCheckout,
			skipDefaultSuccess: true,
		});
		return { paymentUrl: result.data?.payment_url };
	};

	return {
		mutation,
		handleConfirm,
		handleInvoiceAttach,
		handleCheckoutAttach,
		isPending: mutation.isPending,
	};
}
