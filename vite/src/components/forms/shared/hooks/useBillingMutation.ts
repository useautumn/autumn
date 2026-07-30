import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { BillingStageParams } from "../utils/billingStageParams";
import { invalidateCustomerBillingQueries } from "../utils/invalidateCustomerBillingQueries";

type BillingMutationResponse = {
	invoice?: {
		stripe_id?: string;
		hosted_invoice_url?: string | null;
	} | null;
	payment_url?: string | null;
};

export type BillingMutationParams = BillingStageParams & {
	skipDefaultSuccess?: boolean;
};

export function useBillingMutation<
	TRequest extends object,
	TResponse extends BillingMutationResponse,
>({
	customerId,
	path,
	buildRequestBody,
	invalidatesSchedule = false,
	successMessage,
	errorMessage,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	path: string;
	buildRequestBody: (params?: BillingStageParams) => TRequest | null;
	invalidatesSchedule?: boolean;
	successMessage: string;
	errorMessage: string;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const invalidateBillingQueries = () => {
		invalidateCustomerBillingQueries({ queryClient, customerId });
		if (invalidatesSchedule && customerId) {
			queryClient.invalidateQueries({
				queryKey: ["customer-schedule", customerId],
			});
		}
	};

	return useMutation({
		mutationFn: async ({
			skipDefaultSuccess,
			...stageParams
		}: BillingMutationParams) => {
			if (!customerId) throw new Error("Customer ID is required");

			const requestBody = buildRequestBody(stageParams);
			if (!requestBody) throw new Error("Failed to build request body");

			const { data } = await axiosInstance.post<TResponse>(path, requestBody);
			return {
				data,
				useInvoice: stageParams.useInvoice,
				skipDefaultSuccess,
			};
		},
		onSuccess: ({ data, useInvoice, skipDefaultSuccess }) => {
			if (skipDefaultSuccess) {
				invalidateBillingQueries();
				return;
			}

			if (useInvoice) {
				if (data.invoice) {
					toast.success("Invoice created successfully");
				} else {
					toast.success("Subscription started");
					onSuccess?.();
				}
			} else if (data.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
			} else {
				toast.success(successMessage);
			}

			if (!useInvoice || !data.invoice) onSuccess?.();
			invalidateBillingQueries();
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					errorMessage,
			);
		},
	});
}
