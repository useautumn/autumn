import type {
	CustomerPlanChange,
	Feature,
	SetPlansPreviewPhase,
	SetPlansPreviewPlan,
	SetPlansPreviewUnlistedPhase,
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

/** A plan this request creates or changes says when it ends, instead of a separate removal row. */
const endsLater = (plan: SetPlansPreviewPlan) =>
	plan.origin === "request" &&
	(plan.status === "starts" || plan.status === "updated") &&
	plan.expires_at !== null;

/** A change the reviewer is asked to confirm: anything this request causes or withdraws. */
const isRequestedChange = (plan: SetPlansPreviewPlan) =>
	plan.status !== "kept" && plan.origin !== "saved";

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
	origin: plan.origin,
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

/** A date the request has no phase for; withdrawn-only dates are saved phases it removes. */
const unlistedPhaseToReviewPhase = ({
	unlistedPhase,
	features,
	currency,
	nowMs,
}: {
	unlistedPhase: SetPlansPreviewUnlistedPhase;
	features: Feature[];
	currency: string;
	nowMs: number;
}): ReviewChangePhase => ({
	key: `unlisted-${unlistedPhase.starts_at}`,
	label: formatPhaseDate({ startsAt: unlistedPhase.starts_at }),
	startsAt: unlistedPhase.starts_at,
	removed: unlistedPhase.plans.every((plan) => plan.origin === "withdrawn"),
	rows: unlistedPhase.plans.map((plan, planIndex) =>
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

const removedPhaseCount = (phases: ReviewChangePhase[]) =>
	phases.filter((phase) => phase.removed).length;

export const plansToReviewSection = ({
	phases,
	unlistedPhases = [],
	features,
	currency,
	nowMs,
}: {
	phases: SetPlansPreviewPhase[];
	unlistedPhases?: SetPlansPreviewUnlistedPhase[];
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
	const otherPhases = unlistedPhases.map((unlistedPhase) =>
		unlistedPhaseToReviewPhase({ unlistedPhase, features, currency, nowMs }),
	);
	const removedCount = removedPhaseCount(otherPhases);

	return {
		phases: withoutEmptyPhases(
			[...requestPhases, ...otherPhases].sort(
				(first, second) => (first.startsAt ?? 0) - (second.startsAt ?? 0),
			),
		),
		summary: summarizeCounts({
			counts: [
				...phases.map((phase): [string, number] => [
					phaseSummaryLabel({ phase }),
					phase.plans.filter(isRequestedChange).length,
				]),
				[`phase${removedCount === 1 ? "" : "s"} removed`, removedCount],
			],
			emptyLabel: "No changes",
		}),
	};
};
