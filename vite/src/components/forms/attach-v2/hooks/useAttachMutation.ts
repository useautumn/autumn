import type {
	AttachParamsV0,
	BillingResponse,
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import { invalidateCustomerBillingQueries } from "@/components/forms/shared/utils/invalidateCustomerBillingQueries";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getAttachBillingPath } from "../utils/attachBillingPath";

export function useAttachMutation({
	customerId,
	buildRequestBody,
	isMultiPlan = false,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	buildRequestBody: (
		params?: BillingStageParams,
	) => AttachParamsV0 | CreateScheduleParamsV0 | null;
	isMultiPlan?: boolean;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const billingPath = getAttachBillingPath({ isMultiPlan });
	const invalidateBillingQueries = () => {
		invalidateCustomerBillingQueries({ queryClient, customerId });
		if (isMultiPlan && customerId) {
			queryClient.invalidateQueries({
				queryKey: ["customer-schedule", customerId],
			});
		}
	};

	const mutation = useMutation({
		mutationFn: async ({
			skipDefaultSuccess,
			...stageParams
		}: BillingStageParams & { skipDefaultSuccess?: boolean }) => {
			if (!customerId) {
				throw new Error("Customer ID is required");
			}

			const { useInvoice } = stageParams;
			const requestBody = buildRequestBody(stageParams);

			if (!requestBody) {
				throw new Error("Failed to build request body");
			}

			const response = await axiosInstance.post<
				BillingResponse | CreateScheduleResponse
			>(billingPath, requestBody);

			return {
				data: response.data,
				useInvoice,
				skipDefaultSuccess,
			};
		},
		onSuccess: ({ data, useInvoice, skipDefaultSuccess }) => {
			if (skipDefaultSuccess) {
				invalidateBillingQueries();
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

			invalidateBillingQueries();
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

	const handleInvoiceAttach = async (
		params: BillingStageParams & {
			enableProductImmediately: boolean;
			finalizeInvoice?: boolean;
		},
	) => {
		const result = await mutation.mutateAsync({ ...params, useInvoice: true });
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
