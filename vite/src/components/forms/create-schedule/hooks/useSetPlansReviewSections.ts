import type { SetPlansPreviewWarning } from "@autumn/shared";
import { useMemo } from "react";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
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
	const { preview, error, features, products, formValues, nowMs } =
		useCreateScheduleFormContext();
	const { endDate, phases } = formValues;
	const endsAt = hasPaidRecurringSchedulePlan({ phases, products })
		? endDate
		: null;

	return useMemo(() => {
		if (!preview || error) return null;

		const plans = plansToReviewSection({
			phases: preview.phases,
			removedPhases: preview.removed_phases,
			features,
			currency: preview.currency,
			nowMs,
		});

		return {
			warnings: preview.warnings,
			plans,
			balances: balanceChangesToReviewSection({
				phases: preview.phases,
				features,
			}),
			processor: processorItemsToReviewSection({ preview, nowMs, endsAt }),
		};
	}, [preview, error, features, nowMs, endsAt]);
}
