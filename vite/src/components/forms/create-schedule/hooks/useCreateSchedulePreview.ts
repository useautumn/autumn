import type { CreateScheduleParamsV0Input } from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";

export function useCreateSchedulePreview({
	requestBody,
}: {
	requestBody: CreateScheduleParamsV0Input | null;
}) {
	return useBillingPreview({
		path: "/v1/billing.preview_create_schedule",
		queryKeyPrefix: "create-schedule-preview",
		requestBody,
	});
}
