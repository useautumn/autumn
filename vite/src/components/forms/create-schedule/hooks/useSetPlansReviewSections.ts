import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

/** The preview's warnings and review; review is null when a server predating it answered. */
export function useSetPlansReviewSections() {
	const { preview, error } = useCreateScheduleFormContext();
	if (!preview || error) return null;
	return { warnings: preview.warnings, review: preview.review ?? null };
}
