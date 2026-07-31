import type { AttachParamsV0, CreateScheduleParamsV0 } from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";

interface UseAttachPreviewParams {
	path: string;
	requestBody: AttachParamsV0 | CreateScheduleParamsV0 | null;
	enabled?: boolean;
}

export function useAttachPreview({
	path,
	requestBody,
	enabled,
}: UseAttachPreviewParams) {
	return useBillingPreview({
		path,
		queryKeyPrefix: "attach-preview-v2",
		requestBody,
		enabled,
	});
}

export type UseAttachPreviewReturn = ReturnType<typeof useAttachPreview>;
