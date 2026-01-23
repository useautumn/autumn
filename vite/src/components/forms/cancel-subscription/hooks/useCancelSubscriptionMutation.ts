import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import type { CancelActionValue } from "@/components/forms/update-subscription-v2/types/cancelActionSchema";
import type { RefundBehaviorValue } from "@/components/forms/update-subscription-v2/types/refundBehaviourSchema";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export interface CancelSubscriptionMutationParams {
	customerId: string;
	productId: string;
	entityId?: string;
	customerProductId: string;
	onSuccess?: () => void;
}

export function useCancelSubscriptionMutation({
	customerId,
	productId,
	entityId,
	customerProductId,
	onSuccess,
}: CancelSubscriptionMutationParams) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async ({
			cancelAction,
			refundBehavior,
		}: {
			cancelAction: CancelActionValue;
			refundBehavior?: RefundBehaviorValue | null;
		}) => {
			const requestBody: Record<string, unknown> = {
				customer_id: customerId,
				product_id: productId,
				entity_id: entityId || undefined,
				customer_product_id: customerProductId,
				cancel_action: cancelAction,
			};

			if (cancelAction === "cancel_immediately" && refundBehavior) {
				requestBody.refund_behavior = refundBehavior;
			}

			const response = await axiosInstance.post(
				"/v1/subscriptions/update",
				requestBody,
			);
			return response.data;
		},
		onSuccess: () => {
			toast.success("Subscription cancelled successfully");
			onSuccess?.();

			if (customerId) {
				queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
			}
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					"Failed to cancel subscription",
			);
		},
	});

	const handleCancel = ({
		cancelAction,
		refundBehavior,
	}: {
		cancelAction: CancelActionValue;
		refundBehavior?: RefundBehaviorValue | null;
	}) => {
		mutation.mutate({ cancelAction, refundBehavior });
	};

	return {
		mutation,
		handleCancel,
		isPending: mutation.isPending,
	};
}
