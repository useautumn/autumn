import type {
	Feature,
	SetPlansPreviewPhase,
	SetPlansPreviewPlan,
} from "@autumn/shared";
import { formatPhaseDate } from "../schedulePhaseTiming";
import { formatMoney } from "./formatMoney";
import { phaseLabel, phaseSummaryLabel } from "./phaseTiming";
import { reviewPlanPrice } from "./reviewPlanPrice";
import {
	joinDetail,
	summarizeCounts,
	withoutEmptyPhases,
} from "./reviewSectionText";
import type {
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

const planToRow = ({
	plan,
	phaseIndex,
	planIndex,
	features,
	currency,
	nowMs,
}: {
	plan: SetPlansPreviewPlan;
	phaseIndex: number;
	planIndex: number;
	features: Feature[];
	currency: string;
	nowMs: number;
}): ReviewChangeRow => ({
	key: `plan-${phaseIndex}-${planIndex}-${plan.plan_id}`,
	title: plan.name,
	description: joinDetail([
		plan.credit === null ? undefined : "Unused time credited",
		plan.entity_id ? `Entity ${plan.entity_id}` : undefined,
		plan.custom ? "Custom" : undefined,
		plan.status === "updated" && plan.expires_at !== null
			? `Ends ${formatPhaseDate({ startsAt: plan.expires_at })}`
			: undefined,
	]),
	status: plan.status,
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

export const plansToReviewSection = ({
	phases,
	features,
	currency,
	nowMs,
}: {
	phases: SetPlansPreviewPhase[];
	features: Feature[];
	currency: string;
	nowMs: number;
}): ReviewChangeSection => ({
	phases: withoutEmptyPhases(
		phases.map((phase, phaseIndex) => ({
			key: `plans-${phaseIndex}`,
			label: phaseLabel({ phase }),
			rows: phase.plans.map((plan, planIndex) =>
				planToRow({ plan, phaseIndex, planIndex, features, currency, nowMs }),
			),
		})),
	),
	summary: summarizeCounts({
		counts: phases.map((phase) => [
			phaseSummaryLabel({ phase }),
			phase.plans.filter((plan) => plan.status !== "kept").length,
		]),
		emptyLabel: "No changes",
	}),
});
