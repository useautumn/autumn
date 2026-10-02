import type {
	SetPlansParamsV0Input,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";

export function useCreateSchedulePreview({
	requestBody,
}: {
	requestBody: SetPlansParamsV0Input | null;
}) {
	return useBillingPreview<SetPlansParamsV0Input, SetPlansPreviewResponse>({
		path: BILLING_OPERATIONS.setPlans.previewPath,
		queryKeyPrefix: "set-plans-preview",
		requestBody,
	});
}
