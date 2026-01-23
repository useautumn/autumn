import type { PreviewUpdateSubscriptionResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import type { CancelActionValue } from "@/components/forms/update-subscription-v2/types/cancelActionSchema";
import type { RefundBehaviorValue } from "@/components/forms/update-subscription-v2/types/refundBehaviourSchema";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export interface CancelSubscriptionPreviewParams {
	customerId: string;
	productId: string;
	entityId?: string;
	customerProductId: string;
	cancelAction: CancelActionValue;
	refundBehavior?: RefundBehaviorValue | null;
	enabled?: boolean;
}

export function useCancelSubscriptionPreview({
	customerId,
	productId,
	entityId,
	customerProductId,
	cancelAction,
	refundBehavior,
	enabled = true,
}: CancelSubscriptionPreviewParams) {
	const axiosInstance = useAxiosInstance();

	return useQuery({
		queryKey: [
			"cancel-subscription-preview",
			customerId,
			productId,
			entityId,
			customerProductId,
			cancelAction,
			refundBehavior,
		],
		queryFn: async () => {
			const response =
				await axiosInstance.post<PreviewUpdateSubscriptionResponse>(
					"/v1/subscriptions/preview_update",
					{
						customer_id: customerId,
						product_id: productId,
						entity_id: entityId || undefined,
						customer_product_id: customerProductId,
						cancel_action: cancelAction,
						refund_behavior:
							cancelAction === "cancel_immediately"
								? refundBehavior || undefined
								: undefined,
					},
				);
			return response.data;
		},
		enabled: enabled && !!customerId && !!productId && !!customerProductId,
		staleTime: 0,
		retry: (failureCount, error) => {
			const status = (error as AxiosError)?.response?.status;
			if (status && status >= 400 && status < 500) return false;
			return failureCount < 3;
		},
	});
}

export type UseCancelSubscriptionPreviewReturn = ReturnType<
	typeof useCancelSubscriptionPreview
>;
