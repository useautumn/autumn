import type { SetPlansPreviewWarning } from "@autumn/shared";
import { useMemo } from "react";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { balanceChangesToReviewSection } from "../utils/review/balanceChangesToReviewSection";
import { plansToReviewSection } from "../utils/review/plansToReviewSection";
import { processorItemsToReviewSection } from "../utils/review/processorItemsToReviewSection";
import type { ReviewChangeSection } from "../utils/review/types/reviewChange";

type SetPlansReviewSections = {
	warnings: SetPlansPreviewWarning[];
	plans: ReviewChangeSection;
	balances: ReviewChangeSection;
	processor: ReviewChangeSection;
};

export function useSetPlansReviewSections(): SetPlansReviewSections | null {
	const { preview, error, features } = useCreateScheduleFormContext();

	return useMemo(() => {
		if (!preview || error) return null;

		return {
			warnings: preview.warnings,
			plans: plansToReviewSection({
				phases: preview.phases,
				features,
				currency: preview.currency,
			}),
			balances: balanceChangesToReviewSection({
				phases: preview.phases,
				features,
			}),
			processor: processorItemsToReviewSection({ preview }),
		};
	}, [preview, error, features]);
}
