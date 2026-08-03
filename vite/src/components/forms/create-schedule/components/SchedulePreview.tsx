import { useMemo } from "react";
import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function SchedulePreview() {
	const { preview, isPreviewLoading, error } = useCreateScheduleFormContext();

	const previewQuery = useMemo(
		() => ({ data: preview, isLoading: isPreviewLoading, error }),
		[preview, isPreviewLoading, error],
	);

	return <PreviewSection previewQuery={previewQuery} />;
}
