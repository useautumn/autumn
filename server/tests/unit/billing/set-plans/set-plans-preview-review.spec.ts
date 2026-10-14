import { expect, test } from "bun:test";
import type {
	SetPlansPreviewPhase,
	SetPlansPreviewPlan,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { setPlansPreviewToReview } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/setPlansPreviewToReview";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14);

const plan = (status: SetPlansPreviewPlan["status"]): SetPlansPreviewPlan => ({
	plan_id: "enterprise",
	name: "Enterprise",
	status,
	entity_id: null,
	custom: false,
	ongoing: true,
	credit: null,
	expires_at: null,
	trial_ends_at: null,
	prices: [],
});

const phase = ({
	startsAt,
	plans,
}: {
	startsAt: number;
	plans: SetPlansPreviewPlan[];
}): SetPlansPreviewPhase => ({
	starts_at: startsAt,
	starts_now: false,
	ends_subscription: false,
	plans,
	plan_changes: [],
	balance_changes: [],
	processor_items: [],
});

test("a phase repeating the one before it lists the plans it keeps", () => {
	const review = setPlansPreviewToReview({
		preview: {
			currency: "usd",
			phases: [
				phase({ startsAt: NOW, plans: [plan("kept")] }),
				phase({ startsAt: NOW + 100 * DAY_MS, plans: [plan("updated")] }),
				phase({ startsAt: NOW + 465 * DAY_MS, plans: [] }),
			],
			removed_phases: [],
			processor_changes: [],
		} as unknown as Omit<SetPlansPreviewResponse, "review">,
		features: [],
		nowMs: NOW,
	});

	expect(
		review.plans.phases.map((reviewPhase) =>
			reviewPhase.rows.map((row) => [row.title, row.status]),
		),
	).toEqual([
		[["Enterprise", "kept"]],
		[["Enterprise", "updated"]],
		[["Enterprise", "kept"]],
	]);
});
