import type { SetPlansPreviewWarning } from "@autumn/shared";
import { useMemo } from "react";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { balanceChangesToReviewSection } from "../utils/review/balanceChangesToReviewSection";
import { plansToReviewSection } from "../utils/review/plansToReviewSection";
import { processorItemsToReviewSection } from "../utils/review/processorItemsToReviewSection";
import { removedPhasesToReviewPhases } from "../utils/review/removedPhasesToReviewPhases";
import type { ReviewChangeSection } from "../utils/review/types/reviewChange";

type SetPlansReviewSections = {
	warnings: SetPlansPreviewWarning[];
	plans: ReviewChangeSection;
	balances: ReviewChangeSection;
	processor: ReviewChangeSection;
};

const withRemovedPhases = ({
	section,
	removedPhases,
}: {
	section: ReviewChangeSection;
	removedPhases: ReviewChangeSection["phases"];
}): ReviewChangeSection => {
	if (removedPhases.length === 0) return section;
	const removedLabel = `${removedPhases.length} phase${removedPhases.length === 1 ? "" : "s"} removed`;
	return {
		...section,
		phases: [...section.phases, ...removedPhases],
		summary:
			section.summary === "No changes"
				? removedLabel
				: `${section.summary} · ${removedLabel}`,
	};
};

export function useSetPlansReviewSections(): SetPlansReviewSections | null {
	const { preview, error, features, nowMs, form, formValues, products } =
		useCreateScheduleFormContext();
	const initialPhases = form.options.defaultValues?.phases;

	return useMemo(() => {
		if (!preview || error) return null;

		const plans = plansToReviewSection({
			phases: preview.phases,
			features,
			currency: preview.currency,
			nowMs,
		});
		const removedPhases = removedPhasesToReviewPhases({
			initialPhases: initialPhases ?? [],
			phases: formValues.phases,
			products,
			nowMs,
		});

		return {
			warnings: preview.warnings,
			plans: withRemovedPhases({ section: plans, removedPhases }),
			balances: balanceChangesToReviewSection({
				phases: preview.phases,
				features,
			}),
			processor: processorItemsToReviewSection({ preview, features }),
		};
	}, [
		preview,
		error,
		features,
		nowMs,
		initialPhases,
		formValues.phases,
		products,
	]);
}
