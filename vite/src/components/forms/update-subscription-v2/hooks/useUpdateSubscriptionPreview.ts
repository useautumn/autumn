import type {
	ApiVersion,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionV0Params,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";

export function useUpdateSubscriptionPreview({
	requestBody,
	apiVersion,
	enabled,
}: {
	requestBody:
		| UpdateSubscriptionV0Params
		| UpdateSubscriptionV1ParamsInput
		| null;
	/** Set for a V1 body, which only the latest version accepts. */
	apiVersion?: ApiVersion;
	enabled?: boolean;
}) {
	return useBillingPreview<
		UpdateSubscriptionV0Params | UpdateSubscriptionV1ParamsInput,
		PreviewUpdateSubscriptionResponse
	>({
		path: BILLING_OPERATIONS.updateSubscription.previewPath,
		queryKeyPrefix: "update-subscription-preview",
		requestBody,
		enabled,
		apiVersion,
	});
}

export type UseUpdateSubscriptionPreviewReturn = ReturnType<
	typeof useUpdateSubscriptionPreview
>;
