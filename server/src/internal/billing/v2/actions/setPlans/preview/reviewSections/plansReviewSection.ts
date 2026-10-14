import type {
	CustomerPlanChange,
	Feature,
	SetPlansPreviewPhase,
	SetPlansPreviewPlan,
	SetPlansPreviewRemovedPhase,
	SetPlansReviewPhase,
	SetPlansReviewRow,
	SetPlansReviewSection,
} from "@autumn/shared";
import { formatReviewMoney } from "./formatReviewMoney";
import { findPlanChange, planChangeLines } from "./planChangeLines";
import { reviewPlanPrice } from "./reviewPlanPrice";
import {
	dateText,
	joinDetail,
	phaseLabel,
	phaseSummaryLabel,
	reviewText,
	summarizeCounts,
	withoutEmptyPhases,
} from "./reviewText";

/** "$13.33 credited" for the unused time a plan ending now is refunded. */
const planCreditDetail = ({
	plan,
	currency,
}: {
	plan: SetPlansPreviewPlan;
	currency: string;
}) =>
	plan.credit === null
		? undefined
		: `${formatReviewMoney({ amount: Math.abs(plan.credit), currency, showCents: true })} credited`;

const updatedChanges = ({
	plan,
	planChanges,
	features,
	currency,
}: {
	plan: SetPlansPreviewPlan;
	planChanges: CustomerPlanChange[];
	features: Feature[];
	currency: string;
}) => {
	if (plan.status !== "updated") return undefined;
	const change = findPlanChange({
		planChanges,
		planId: plan.plan_id,
		entityId: plan.entity_id,
	});
	return change ? planChangeLines({ change, features, currency }) : undefined;
};

const endsLater = (plan: SetPlansPreviewPlan) =>
	(plan.status === "starts" || plan.status === "updated") &&
	plan.expires_at !== null;

const isChanged = (plan: SetPlansPreviewPlan) => plan.status !== "kept";

const planToRow = ({
	plan,
	rowKey,
	planChanges,
	features,
	currency,
	nowMs,
}: {
	plan: SetPlansPreviewPlan;
	rowKey: string;
	planChanges: CustomerPlanChange[];
	features: Feature[];
	currency: string;
	nowMs: number;
}): SetPlansReviewRow => ({
	key: `${rowKey}-${plan.plan_id}`,
	title: plan.name,
	description: joinDetail([
		planCreditDetail({ plan, currency }),
		plan.custom ? "Custom" : undefined,
		endsLater(plan) && plan.expires_at !== null
			? reviewText("Ends ", dateText(plan.expires_at))
			: undefined,
	]),
	entity_id: plan.entity_id ?? null,
	status: plan.status,
	ongoing: plan.ongoing,
	changes: updatedChanges({ plan, planChanges, features, currency }),
	trial_ends_at:
		plan.status !== "ends" &&
		plan.trial_ends_at !== null &&
		plan.trial_ends_at > nowMs
			? plan.trial_ends_at
			: undefined,
	value: reviewPlanPrice({ prices: plan.prices, features }),
});

/** A phase repeating the one before it has no changes of its own, so it lists the plans it keeps. */
const withRepeatedPhaseRows = (phases: SetPlansReviewPhase[]) => {
	const filled: SetPlansReviewPhase[] = [];
	for (const phase of phases) {
		const previous = filled.at(-1);
		if (phase.rows.length > 0 || !previous) {
			filled.push(phase);
			continue;
		}
		const keptRows = previous.rows
			.filter((row) => row.status !== "ends")
			.map((row) => ({
				...row,
				key: `${phase.key}-${row.key}`,
				status: "kept" as const,
				changes: undefined,
				description: undefined,
			}));
		filled.push({ ...phase, rows: keptRows });
	}
	return filled;
};

export const plansReviewSection = ({
	phases,
	removedPhases,
	features,
	currency,
	nowMs,
}: {
	phases: SetPlansPreviewPhase[];
	removedPhases: SetPlansPreviewRemovedPhase[];
	features: Feature[];
	currency: string;
	nowMs: number;
}): SetPlansReviewSection => {
	const requestPhases = withRepeatedPhaseRows(
		phases.map((phase, phaseIndex) => ({
			key: `plans-${phaseIndex}`,
			label: phaseLabel(phase),
			rows: phase.plans.map((plan, planIndex) =>
				planToRow({
					plan,
					rowKey: `plan-${phaseIndex}-${planIndex}`,
					planChanges: phase.plan_changes,
					features,
					currency,
					nowMs,
				}),
			),
		})),
	).map((phase, phaseIndex) => ({
		phase,
		startsAt: phases[phaseIndex].starts_at,
	}));
	const removedReviewPhases = removedPhases.map((removedPhase) => ({
		startsAt: removedPhase.starts_at,
		phase: {
			key: `removed-${removedPhase.starts_at}`,
			label: dateText(removedPhase.starts_at),
			removed: true,
			rows: removedPhase.plans.map((plan, planIndex) =>
				planToRow({
					plan,
					rowKey: `removed-${removedPhase.starts_at}-${planIndex}`,
					planChanges: [],
					features,
					currency,
					nowMs,
				}),
			),
		},
	}));
	const removedCount = removedReviewPhases.length;

	return {
		phases: withoutEmptyPhases(
			[...requestPhases, ...removedReviewPhases]
				.sort((first, second) => first.startsAt - second.startsAt)
				.map(({ phase }) => phase),
		),
		summary: summarizeCounts({
			counts: [
				...phases.map(
					(phase): [ReturnType<typeof phaseSummaryLabel>, number] => [
						phaseSummaryLabel(phase),
						phase.plans.filter(isChanged).length,
					],
				),
				[`phase${removedCount === 1 ? "" : "s"} removed`, removedCount],
			],
			emptyLabel: "No changes",
		}),
	};
};
