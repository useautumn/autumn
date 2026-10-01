import type {
	CustomerPlanChange,
	Feature,
	SetPlansPreviewPhase,
	SetPlansPreviewPlan,
	SetPlansPreviewRemovedPhase,
} from "@autumn/shared";
import { formatPhaseDate } from "../schedulePhaseTiming";
import { formatMoney } from "./formatMoney";
import { phaseLabel, phaseSummaryLabel } from "./phaseTiming";
import { findPlanChange, planChangeLines } from "./planChangeLines";
import { reviewPlanPrice } from "./reviewPlanPrice";
import {
	joinDetail,
	summarizeCounts,
	withoutEmptyPhases,
} from "./reviewSectionText";
import type {
	ReviewChangePhase,
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeValue,
} from "./types/reviewChange";

const planCreditValue = ({
	plan,
	currency,
}: {
	plan: SetPlansPreviewPlan;
	currency: string;
}): ReviewChangeValue | undefined =>
	plan.credit === null
		? undefined
		: {
				amount: formatMoney({ amount: plan.credit, currency, showCents: true }),
				suffix: "credit",
			};

const updatedChanges = ({
	plan,
	planChanges,
	features,
}: {
	plan: SetPlansPreviewPlan;
	planChanges: CustomerPlanChange[];
	features: Feature[];
}) => {
	if (plan.status !== "updated") return undefined;
	const change = findPlanChange({
		planChanges,
		planId: plan.plan_id,
		entityId: plan.entity_id,
	});
	return change ? planChangeLines({ change, features }) : undefined;
};

const endsLater = (plan: SetPlansPreviewPlan) =>
	(plan.status === "starts" || plan.status === "updated") &&
	plan.expires_at !== null;

const isChanged = (plan: SetPlansPreviewPlan) => plan.status !== "kept";

const planToRow = ({
	plan,
	phaseIndex,
	planIndex,
	planChanges,
	features,
	currency,
	nowMs,
}: {
	plan: SetPlansPreviewPlan;
	phaseIndex: number;
	planIndex: number;
	planChanges: CustomerPlanChange[];
	features: Feature[];
	currency: string;
	nowMs: number;
}): ReviewChangeRow => ({
	key: `plan-${phaseIndex}-${planIndex}-${plan.plan_id}`,
	title: plan.name,
	description: joinDetail([
		plan.credit === null ? undefined : "Unused time credited",
		plan.custom ? "Custom" : undefined,
		endsLater(plan) && plan.expires_at !== null
			? `Ends ${formatPhaseDate({ startsAt: plan.expires_at })}`
			: undefined,
	]),
	entityId: plan.entity_id ?? null,
	status: plan.status,
	changes: updatedChanges({ plan, planChanges, features }),
	trialEndsAt:
		plan.status !== "ends" &&
		plan.trial_ends_at !== null &&
		plan.trial_ends_at > nowMs
			? plan.trial_ends_at
			: undefined,
	value:
		plan.status === "ends"
			? planCreditValue({ plan, currency })
			: reviewPlanPrice({ prices: plan.prices, features }),
});

const removedPhaseToReviewPhase = ({
	removedPhase,
	features,
	currency,
	nowMs,
}: {
	removedPhase: SetPlansPreviewRemovedPhase;
	features: Feature[];
	currency: string;
	nowMs: number;
}): ReviewChangePhase => ({
	key: `removed-${removedPhase.starts_at}`,
	label: formatPhaseDate({ startsAt: removedPhase.starts_at }),
	startsAt: removedPhase.starts_at,
	removed: true,
	rows: removedPhase.plans.map((plan, planIndex) =>
		planToRow({
			plan,
			phaseIndex: -1 - planIndex,
			planIndex,
			planChanges: [],
			features,
			currency,
			nowMs,
		}),
	),
});

export const plansToReviewSection = ({
	phases,
	removedPhases = [],
	features,
	currency,
	nowMs,
}: {
	phases: SetPlansPreviewPhase[];
	removedPhases?: SetPlansPreviewRemovedPhase[];
	features: Feature[];
	currency: string;
	nowMs: number;
}): ReviewChangeSection => {
	const requestPhases = phases.map((phase, phaseIndex) => ({
		key: `plans-${phaseIndex}`,
		label: phaseLabel({ phase }),
		startsAt: phase.starts_at,
		rows: phase.plans.map((plan, planIndex) =>
			planToRow({
				plan,
				phaseIndex,
				planIndex,
				planChanges: phase.plan_changes,
				features,
				currency,
				nowMs,
			}),
		),
	}));
	const removedReviewPhases = removedPhases.map((removedPhase) =>
		removedPhaseToReviewPhase({ removedPhase, features, currency, nowMs }),
	);
	const removedCount = removedReviewPhases.length;

	return {
		phases: withoutEmptyPhases(
			[...requestPhases, ...removedReviewPhases].sort(
				(first, second) => (first.startsAt ?? 0) - (second.startsAt ?? 0),
			),
		),
		summary: summarizeCounts({
			counts: [
				...phases.map((phase): [string, number] => [
					phaseSummaryLabel({ phase }),
					phase.plans.filter(isChanged).length,
				]),
				[`phase${removedCount === 1 ? "" : "s"} removed`, removedCount],
			],
			emptyLabel: "No changes",
		}),
	};
};
