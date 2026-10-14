import type {
	CustomerPlanChange,
	Feature,
	SetPlansPreviewPlan,
	SetPlansPreviewResponse,
	SetPlansReviewRow,
	SetPlansReviewSection,
} from "@autumn/shared";
import { findPlanChange } from "./findPlanChange";
import { formatReviewMoney } from "./formatReviewMoney";
import { planChangeLines } from "./planChangeLines";
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

/** "Ends Nov 1, 2026" for a plan this phase starts or updates with an end date. */
const endsLater = (plan: SetPlansPreviewPlan) => {
	if (plan.status !== "starts" && plan.status !== "updated") return undefined;
	if (plan.expires_at === null) return undefined;
	return reviewText("Ends ", dateText(plan.expires_at));
};

const isChanged = (plan: SetPlansPreviewPlan) => plan.status !== "kept";

const planToRow = ({
	plan,
	rowKey,
	planChanges,
	features,
	currency,
	currentEpochMs,
}: {
	plan: SetPlansPreviewPlan;
	rowKey: string;
	planChanges: CustomerPlanChange[];
	features: Feature[];
	currency: string;
	currentEpochMs: number;
}): SetPlansReviewRow => ({
	key: `${rowKey}-${plan.plan_id}`,
	title: plan.name,
	description: joinDetail([
		planCreditDetail({ plan, currency }),
		plan.custom ? "Custom" : undefined,
		endsLater(plan),
	]),
	entity_id: plan.entity_id ?? null,
	status: plan.status,
	ongoing: plan.ongoing,
	changes: updatedChanges({ plan, planChanges, features, currency }),
	trial_ends_at:
		plan.status !== "ends" &&
		plan.trial_ends_at !== null &&
		plan.trial_ends_at > currentEpochMs
			? plan.trial_ends_at
			: undefined,
	value: reviewPlanPrice({ prices: plan.prices, features }),
});

export const plansReviewSection = ({
	preview: { phases, removed_phases: removedPhases, currency },
	features,
	currentEpochMs,
}: {
	preview: Pick<
		SetPlansPreviewResponse,
		"phases" | "removed_phases" | "currency"
	>;
	features: Feature[];
	currentEpochMs: number;
}): SetPlansReviewSection => {
	const toRows = ({
		plans,
		keyPrefix,
		planChanges = [],
	}: {
		plans: SetPlansPreviewPlan[];
		keyPrefix: string;
		planChanges?: CustomerPlanChange[];
	}) =>
		plans.map((plan, planIndex) =>
			planToRow({
				plan,
				rowKey: `${keyPrefix}-${planIndex}`,
				planChanges,
				features,
				currency,
				currentEpochMs,
			}),
		);
	const datedPhases = [
		...phases.map((phase, phaseIndex) => ({
			startsAt: phase.starts_at,
			key: `plans-${phaseIndex}`,
			label: phaseLabel(phase),
			rows: toRows({
				plans: phase.plans,
				keyPrefix: `plan-${phaseIndex}`,
				planChanges: phase.plan_changes,
			}),
		})),
		...removedPhases.map(({ starts_at, plans }) => ({
			startsAt: starts_at,
			key: `removed-${starts_at}`,
			label: dateText(starts_at),
			removed: true,
			rows: toRows({ plans, keyPrefix: `removed-${starts_at}` }),
		})),
	];
	const removedCount = removedPhases.length;

	return {
		phases: withoutEmptyPhases(
			datedPhases
				.sort((first, second) => first.startsAt - second.startsAt)
				.map(({ startsAt: _startsAt, ...phase }) => phase),
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
