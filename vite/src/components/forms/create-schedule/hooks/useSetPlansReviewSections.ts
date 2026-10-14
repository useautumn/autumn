import type {
	SetPlansPreviewReview,
	SetPlansPreviewWarning,
} from "@autumn/shared";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

type SetPlansReviewSections = SetPlansPreviewReview & {
	warnings: SetPlansPreviewWarning[];
};

export function useSetPlansReviewSections(): SetPlansReviewSections | null {
	const { preview, error } = useCreateScheduleFormContext();
	if (!preview?.review || error) return null;
	return { warnings: preview.warnings, ...preview.review };
}
