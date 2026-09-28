import type {
	CustomerPlanChange,
	ProductV2,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { immediatePlanCredit } from "./immediatePlanCredit";
import { matchPlanChangesToDeclaredPlans } from "./matchPlanChangesToDeclaredPlans";
import {
	formatPhaseDate,
	isImmediatePhase,
	phaseLabel,
	phaseSummaryLabel,
} from "./phaseTiming";
import { planChangePlanId } from "./planChangePlanId";
import {
	joinDetail,
	summarizeCounts,
	withoutEmptyPhases,
} from "./reviewSectionText";
import { splitPriceLabel } from "./splitPriceLabel";
import type {
	ReviewChangePhase,
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeStatus,
	ReviewPlan,
} from "./types/reviewChange";

type PlanChangeStatus = Extract<
	ReviewChangeStatus,
	"starts" | "ends" | "updated"
>;

const PLAN_CHANGE_STATUS: Record<
	CustomerPlanChange["action"],
	PlanChangeStatus
> = {
	activated: "starts",
	scheduled: "starts",
	expired: "ends",
	updated: "updated",
};

type PlanRowContext = {
	products: ProductV2[];
	priceLabelFor: (product: ProductV2) => string;
};

const findProduct = ({
	products,
	planId,
}: {
	products: ProductV2[];
	planId: string;
}) => products.find((product) => product.id === planId);

const planChangeExtras = ({
	change,
	status,
}: {
	change: CustomerPlanChange;
	status: PlanChangeStatus;
}) => {
	const expiresAt = change.subscription?.expires_at;
	const endsLater = status === "updated" && expiresAt;

	return [
		change.entity_id ? `Entity ${change.entity_id}` : undefined,
		change.plan_change ? "Custom" : undefined,
		endsLater ? `Ends ${formatPhaseDate({ startsAt: expiresAt })}` : undefined,
	];
};

const productPrice = ({
	product,
	context,
}: {
	product: ProductV2 | undefined;
	context: PlanRowContext;
}) => (product ? splitPriceLabel(context.priceLabelFor(product)) : undefined);

const planChangeToRow = ({
	preview,
	phase,
	change,
	declaredPlan,
	phaseIndex,
	context,
}: {
	preview: SetPlansPreviewResponse;
	phase: SetPlansPreviewPhase;
	change: CustomerPlanChange;
	declaredPlan: ReviewPlan | undefined;
	phaseIndex: number;
	context: PlanRowContext;
}): ReviewChangeRow => {
	const planId = planChangePlanId(change);
	const product =
		declaredPlan?.product ??
		findProduct({ products: context.products, planId });
	const status = PLAN_CHANGE_STATUS[change.action];
	const credit =
		status === "ends" && isImmediatePhase({ phaseIndex })
			? immediatePlanCredit({
					preview,
					planId,
					immediateChanges: phase.plan_changes,
				})
			: undefined;

	return {
		key: `plan-${phaseIndex}-${planId}-${change.entity_id ?? ""}-${change.action}`,
		title: product?.name ?? planId,
		description: joinDetail([
			credit?.description,
			...planChangeExtras({ change, status }),
		]),
		status,
		value:
			status === "ends" ? credit?.value : productPrice({ product, context }),
	};
};

const findPreviousPlan = ({
	plan,
	previousPlans,
}: {
	plan: ReviewPlan;
	previousPlans: ReviewPlan[];
}) =>
	previousPlans.find(
		(previous) =>
			previous.planId === plan.planId && previous.entityId === plan.entityId,
	) ?? previousPlans.find((previous) => previous.planId === plan.planId);

/** Declared plans with no change this phase that were already active, priced as they stand. */
const keptPlanRows = ({
	phaseIndex,
	unchangedPlans,
	previousPlans,
	context,
}: {
	phaseIndex: number;
	unchangedPlans: ReviewPlan[];
	previousPlans: ReviewPlan[];
	context: PlanRowContext;
}): ReviewChangeRow[] =>
	unchangedPlans.flatMap((plan, planIndex) => {
		const previousPlan = findPreviousPlan({ plan, previousPlans });
		if (!previousPlan) return [];

		const product = previousPlan.product ?? plan.product;
		return [
			{
				key: `plan-${phaseIndex}-${plan.planId}-${plan.entityId ?? ""}-kept-${planIndex}`,
				title: product?.name ?? plan.planId,
				status: "kept",
				value: productPrice({ product, context }),
			},
		];
	});

type PlanPhase = {
	changeCount: number;
	startsAt: number;
	phase: ReviewChangePhase;
};

export const planChangesToReviewSection = ({
	preview,
	declaredPlansByPhase,
	existingPlans,
	nowMs,
	context,
}: {
	preview: SetPlansPreviewResponse;
	declaredPlansByPhase: ReviewPlan[][];
	existingPlans: ReviewPlan[];
	nowMs: number;
	context: PlanRowContext;
}): ReviewChangeSection => {
	const phases: PlanPhase[] = preview.phases.map(
		(phase: SetPlansPreviewPhase, phaseIndex: number) => {
			const declaredPlans = declaredPlansByPhase[phaseIndex] ?? [];
			const { matchedPlans, unmatchedPlans } = matchPlanChangesToDeclaredPlans({
				changes: phase.plan_changes,
				declaredPlans,
			});
			const changeRows = phase.plan_changes.map(
				(change: CustomerPlanChange, changeIndex: number) =>
					planChangeToRow({
						preview,
						phase,
						change,
						declaredPlan: matchedPlans[changeIndex],
						phaseIndex,
						context,
					}),
			);
			const keptRows = keptPlanRows({
				phaseIndex,
				unchangedPlans: unmatchedPlans,
				previousPlans: isImmediatePhase({ phaseIndex })
					? existingPlans
					: (declaredPlansByPhase[phaseIndex - 1] ?? []),
				context,
			});

			return {
				changeCount: changeRows.length,
				startsAt: phase.starts_at,
				phase: {
					key: `plans-${phaseIndex}`,
					label: phaseLabel({ phaseIndex, startsAt: phase.starts_at, nowMs }),
					rows: [...changeRows, ...keptRows],
				},
			};
		},
	);

	return {
		phases: withoutEmptyPhases(phases.map(({ phase }) => phase)),
		summary: summarizeCounts({
			counts: phases.map(({ startsAt, changeCount }, phaseIndex) => [
				phaseSummaryLabel({ phaseIndex, startsAt, nowMs }),
				changeCount,
			]),
			emptyLabel: "No changes",
		}),
		stripeIds: [],
	};
};
