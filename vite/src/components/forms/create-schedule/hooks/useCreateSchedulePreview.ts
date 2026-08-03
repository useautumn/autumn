import type { CreateScheduleParamsV0Input } from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";

export function useCreateSchedulePreview({
	requestBody,
}: {
	requestBody: CreateScheduleParamsV0Input | null;
}) {
	return useBillingPreview({
		path: BILLING_OPERATIONS.createSchedule.previewPath,
		queryKeyPrefix: "create-schedule-preview",
		requestBody,
	});
}
