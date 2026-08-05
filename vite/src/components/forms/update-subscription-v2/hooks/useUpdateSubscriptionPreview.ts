import type {
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";

export function useUpdateSubscriptionPreview({
	requestBody,
	enabled,
}: {
	requestBody: UpdateSubscriptionV0Params | null;
	enabled?: boolean;
}) {
	return useBillingPreview<
		UpdateSubscriptionV0Params,
		PreviewUpdateSubscriptionResponse
	>({
		path: BILLING_OPERATIONS.updateSubscription.previewPath,
		queryKeyPrefix: "update-subscription-preview",
		requestBody,
		enabled,
	});
}

export type UseUpdateSubscriptionPreviewReturn = ReturnType<
	typeof useUpdateSubscriptionPreview
>;
