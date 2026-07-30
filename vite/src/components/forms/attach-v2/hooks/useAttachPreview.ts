import type {
	AttachParamsV0,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";
import { getAttachBillingPath } from "../utils/attachBillingPath";

interface UseAttachPreviewParams {
	requestBody: AttachParamsV0 | CreateScheduleParamsV0 | null;
	isMultiPlan?: boolean;
	enabled?: boolean;
}

export function useAttachPreview({
	requestBody,
	isMultiPlan = false,
	enabled,
}: UseAttachPreviewParams) {
	return useBillingPreview({
		path: getAttachBillingPath({ isMultiPlan, preview: true }),
		queryKeyPrefix: "attach-preview-v2",
		requestBody,
		enabled,
	});
}

export type UseAttachPreviewReturn = ReturnType<typeof useAttachPreview>;
