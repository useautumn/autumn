import type {
	Feature,
	SetPlansPreviewResponse,
	SetPlansPreviewReview,
} from "@autumn/shared";
import { balancesReviewSection } from "./balancesReviewSection";
import { plansReviewSection } from "./plansReviewSection";
import { subscriptionReviewSection } from "./subscriptionReviewSection";

/** The preview as the dashboard renders it. */
export const setPlansPreviewToReview = ({
	preview,
	features,
	nowMs,
	endsAt,
}: {
	preview: Omit<SetPlansPreviewResponse, "review">;
	features: Feature[];
	nowMs: number;
	endsAt?: number;
}): SetPlansPreviewReview => ({
	plans: plansReviewSection({
		phases: preview.phases,
		removedPhases: preview.removed_phases,
		features,
		currency: preview.currency,
		nowMs,
	}),
	balances: balancesReviewSection({ phases: preview.phases, features }),
	subscription: subscriptionReviewSection({ preview, nowMs, endsAt }),
});
