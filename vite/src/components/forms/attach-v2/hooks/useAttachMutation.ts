import type { AttachParamsV0, BillingResponse } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
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
			skipDefaultSuccess,
		}: {
			useInvoice?: boolean;
			enableProductImmediately?: boolean;
			finalizeInvoice?: boolean;
			skipDefaultSuccess?: boolean;
		}) => {
			if (!customerId) {
				throw new Error("Customer ID is required");
			}

			const requestBody = buildRequestBody({
				useInvoice,
				enableProductImmediately,
				finalizeInvoice,
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
				if (customerId) {
					queryClient.invalidateQueries({
						queryKey: ["customer", customerId],
					});
				}
				return;
			}

			if (useInvoice) {
				if (data?.invoice) {
					toast.success("Invoice created successfully");
				}
			} else if (data?.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
			} else {
				toast.success("Product attached successfully");
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

	const handleCheckoutAttach = async ({
		enablePlanImmediately,
	}: {
		enablePlanImmediately: boolean;
	}) => {
		const result = await mutation.mutateAsync({
			useInvoice: false,
			enableProductImmediately: enablePlanImmediately,
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
