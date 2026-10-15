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
	currentEpochMs,
	endsAt,
}: {
	preview: Omit<SetPlansPreviewResponse, "review">;
	features: Feature[];
	currentEpochMs: number;
	endsAt?: number;
}): SetPlansPreviewReview => ({
	plans: plansReviewSection({ preview, features, currentEpochMs }),
	balances: balancesReviewSection({ preview, features }),
	subscription: subscriptionReviewSection({ preview, currentEpochMs, endsAt }),
});
