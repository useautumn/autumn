import { expect, test } from "bun:test";
import type { SetPlansPreviewPhase, SetPlansPreviewPlan } from "@autumn/shared";
import { plansToReviewSection } from "./plansToReviewSection";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14);

const plan = (status: SetPlansPreviewPlan["status"]) =>
	({
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
	}) as unknown as SetPlansPreviewPlan;

const phase = ({
	startsAt,
	plans,
}: {
	startsAt: number;
	plans: SetPlansPreviewPlan[];
}) =>
	({
		starts_at: startsAt,
		starts_now: false,
		plans,
		plan_changes: [],
	}) as unknown as SetPlansPreviewPhase;

test("a phase repeating the one before it lists the plans it keeps", () => {
	const section = plansToReviewSection({
		phases: [
			phase({ startsAt: NOW, plans: [plan("kept")] }),
			phase({ startsAt: NOW + 100 * DAY_MS, plans: [plan("updated")] }),
			phase({ startsAt: NOW + 465 * DAY_MS, plans: [] }),
		],
		features: [],
		currency: "usd",
		nowMs: NOW,
	});

	expect(
		section.phases.map((reviewPhase) =>
			reviewPhase.rows.map((row) => [row.title, row.status]),
		),
	).toEqual([
		[["Enterprise", "kept"]],
		[["Enterprise", "updated"]],
		[["Enterprise", "kept"]],
	]);
});
