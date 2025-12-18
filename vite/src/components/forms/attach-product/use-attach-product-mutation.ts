import type { ProductV2 } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAttachBodyBuilder } from "./use-attach-body-builder";

interface AttachProductParams {
	// Product selection (provide one of these)
	productId?: string;
	product?: ProductV2;

	// Optional overrides
	entityId?: string;
	prepaidOptions?: Record<string, number>;
	version?: number;

	// Invoice options
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
}

export function useAttachProductMutation({
	customerId,
	onSuccess,
	onError,
	successMessage = "Successfully attached product",
}: {
	customerId: string;
	onSuccess?: (data: unknown) => void | Promise<void>;
	onError?: (error: unknown) => void;
	successMessage?: string;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();

	// Get builder function from shared hook
	const { buildAttachBody } = useAttachBodyBuilder({ customerId });

	return useMutation({
		mutationFn: async (params: AttachProductParams) => {
			// Build attach body using shared builder function
			const attachBody = buildAttachBody({
				productId: params.productId,
				product: params.product,
				entityId: params.entityId,
				prepaidOptions: params.prepaidOptions,
				version: params.version,
				useInvoice: params.useInvoice,
				enableProductImmediately: params.enableProductImmediately,
			});

			if (!attachBody) {
				throw new Error(
					"Failed to build attach body - product not found or missing data",
				);
			}

			return await CusService.attach(axiosInstance, attachBody);
		},
		onSuccess: async (response) => {
			// Don't show success toast if checkout_url is returned - product not attached yet
			if (response.data.checkout_url) {
				toast.success("Redirecting to checkout URL");
				closeSheet();
				return;
			}

			toast.success(successMessage);
			closeSheet();
			queryClient.invalidateQueries({ queryKey: ["customer", customerId] });

			if (onSuccess) {
				await onSuccess(response.data);
			}
		},
		onError: (error) => {
			if (onError) {
				onError(error);
			} else {
				toast.error(
					(error as AxiosError<{ message: string }>)?.response?.data?.message ??
						"Failed to attach product",
				);
				console.error(error);
			}
		},
	});
}
