import type { Feature, ProductV2, SetPlansParamsV0 } from "@autumn/shared";
import { useMemo } from "react";
import { customerStatePlanToApiPlan } from "@/components/forms/customer-state/customerStatePlanToApiPlan";
import {
	type CustomerStateForm,
	type CustomerStatePhase,
	type CustomerStatePlan,
	getCreateSchedulePhaseTimingError,
} from "@/components/forms/customer-state/customerStateSchema";
import { applyMultiPlanStageParams } from "@/components/forms/shared/utils/applyMultiPlanStageParams";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import type { BillingCycleAnchorMode } from "@/components/forms/shared/utils/resolveBillingCycleAnchor";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
import { phaseToBillingCycleAnchor } from "../utils/phaseBillingCycleAnchor";
import { firstPhaseStartsLater } from "../utils/schedulePhaseTiming";

export function buildCreateScheduleRequestBody({
	customerId,
	phases,
	unscheduledPlans = [],
	products,
	features,
	nowMs,
	resetBillingCycle,
	billingCycleAnchorMode,
	billingCycleAnchorDate,
	endDate,
	allowFirstPhaseBackdate,
	enablePlanImmediately,
	stripeSubscriptionId,
}: {
	customerId: string | undefined;
	phases: CustomerStatePhase[];
	unscheduledPlans?: CustomerStatePlan[];
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	resetBillingCycle?: boolean;
	billingCycleAnchorMode?: BillingCycleAnchorMode;
	billingCycleAnchorDate?: number | null;
	endDate?: number | null;
	allowFirstPhaseBackdate?: boolean;
	enablePlanImmediately?: boolean;
	stripeSubscriptionId?: string | null;
}): SetPlansParamsV0 | null {
	const now = nowMs ?? Date.now();
	if (!customerId || phases.length === 0) return null;
	if (getCreateSchedulePhaseTimingError({ phases, nowMs: now })) return null;
	const startsLater = firstPhaseStartsLater({ phases, nowMs: now });
	// A first phase starting later anchors on its own start, so only one starting now takes a date.
	const usesCustomAnchor = billingCycleAnchorMode === "custom" && !startsLater;
	const customAnchor = usesCustomAnchor
		? (billingCycleAnchorDate ?? null)
		: null;
	const resetsFirstPhaseCycle =
		!!resetBillingCycle && (!usesCustomAnchor || customAnchor !== null);

	const toApiPlan = (plan: CustomerStatePlan) =>
		customerStatePlanToApiPlan({ plan, products, features });

	const apiPhases = phases.map((phase, index) => {
		let startsAt = phase.startsAt;
		if (index === 0) {
			const hasStarted =
				phase.persistedStartsAt != null && phase.persistedStartsAt <= now;
			if (allowFirstPhaseBackdate || startsLater)
				startsAt = phase.startsAt ?? now;
			else if (phase.persistedStartsAt == null) startsAt = now;
			else
				startsAt = hasStarted
					? Math.min(
							phase.startsAt ?? phase.persistedStartsAt,
							phase.persistedStartsAt,
						)
					: (phase.startsAt ?? phase.persistedStartsAt);
		}
		if (startsAt === null) return null;

		const plans = phase.plans.flatMap((plan) =>
			plan.productId ? [toApiPlan(plan)] : [],
		);

		if (plans.length === 0) return null;
		return {
			keepsCycleAnchor: phase.keepsCycleAnchor,
			prorationBehavior: phase.prorationBehavior,
			starts_at: startsAt,
			plans,
		};
	});

	const validPhases = apiPhases.filter(
		(phase): phase is NonNullable<typeof phase> => phase !== null,
	);
	if (validPhases.length === 0) return null;

	// The form's first phase owns the request's first-phase billing, even when it has no plans.
	const requestPhases = validPhases.map(
		(
			{ keepsCycleAnchor, prorationBehavior: ownProration, ...apiPhase },
			index,
		) => {
			const isFirstPhase = index === 0;
			const prorationBehavior = isFirstPhase
				? phases[0]?.prorationBehavior
				: ownProration;
			const billingCycleAnchor = phaseToBillingCycleAnchor({
				phase: { keepsCycleAnchor },
				isFirstPhase,
				resetBillingCycle: resetsFirstPhaseCycle,
				customAnchor,
			});
			return {
				...apiPhase,
				...(billingCycleAnchor && { billing_cycle_anchor: billingCycleAnchor }),
				...(prorationBehavior && { proration_behavior: prorationBehavior }),
			};
		},
	);

	const apiUnscheduledPlans = unscheduledPlans.flatMap((plan) =>
		plan.productId ? [toApiPlan(plan)] : [],
	);

	const body: Record<string, unknown> = {
		customer_id: customerId,
		phases: requestPhases,
		...(apiUnscheduledPlans.length > 0
			? { unscheduled_plans: apiUnscheduledPlans }
			: {}),
	};

	if (enablePlanImmediately && startsLater) body.enable_plan_immediately = true;
	if (stripeSubscriptionId) body.stripe_subscription_id = stripeSubscriptionId;
	if (endDate && hasPaidRecurringSchedulePlan({ phases, products })) {
		body.ends_at = endDate;
	}
	return body as SetPlansParamsV0;
}

/** A submit body: the form's request plus what its billing stage chose, never a stale form-only flag. */
export function buildCreateScheduleStageRequestBody({
	stageParams = {},
	...params
}: Parameters<typeof buildCreateScheduleRequestBody>[0] & {
	stageParams?: BillingStageParams;
}): SetPlansParamsV0 | null {
	return applyMultiPlanStageParams({
		...stageParams,
		requestBody: buildCreateScheduleRequestBody(params),
	});
}

export function useCreateScheduleRequestBody({
	customerId,
	phases,
	unscheduledPlans,
	products,
	features,
	nowMs,
	resetBillingCycle,
	billingCycleAnchorMode,
	billingCycleAnchorDate,
	endDate,
	allowFirstPhaseBackdate,
	enablePlanImmediately,
	stripeSubscriptionId,
}: {
	customerId: string | undefined;
	phases: CustomerStatePhase[];
	unscheduledPlans?: CustomerStatePlan[];
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	resetBillingCycle?: boolean;
	billingCycleAnchorMode?: BillingCycleAnchorMode;
	billingCycleAnchorDate?: number | null;
	endDate?: number | null;
	allowFirstPhaseBackdate?: boolean;
	enablePlanImmediately?: boolean;
	stripeSubscriptionId?: string | null;
}) {
	return useMemo(
		() =>
			buildCreateScheduleRequestBody({
				customerId,
				phases,
				unscheduledPlans,
				products,
				features,
				nowMs,
				resetBillingCycle,
				billingCycleAnchorMode,
				billingCycleAnchorDate,
				endDate,
				allowFirstPhaseBackdate,
				enablePlanImmediately,
				stripeSubscriptionId,
			}),
		[
			customerId,
			phases,
			unscheduledPlans,
			products,
			features,
			nowMs,
			resetBillingCycle,
			billingCycleAnchorMode,
			billingCycleAnchorDate,
			endDate,
			allowFirstPhaseBackdate,
			enablePlanImmediately,
			stripeSubscriptionId,
		],
	);
}

export function useBuildCreateScheduleRequestBody({
	customerId,
	products,
	features,
	nowMs,
	getPhases,
	getUnscheduledPlans,
	getResetBillingCycle,
	getBillingCycleAnchor,
	getEndDate,
	getEnablePlanImmediately,
	getAllowFirstPhaseBackdate,
	stripeSubscriptionId,
}: {
	customerId: string | undefined;
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	getPhases: () => CustomerStatePhase[];
	getUnscheduledPlans?: () => CustomerStatePlan[];
	getResetBillingCycle?: () => boolean;
	getBillingCycleAnchor?: () => Pick<
		CustomerStateForm,
		"billingCycleAnchorMode" | "billingCycleAnchorDate"
	>;
	getEndDate?: () => CustomerStateForm["endDate"];
	getEnablePlanImmediately?: () => boolean;
	getAllowFirstPhaseBackdate?: () => boolean;
	stripeSubscriptionId?: string | null;
}) {
	return useMemo(
		() =>
			(stageParams: BillingStageParams = {}): SetPlansParamsV0 | null =>
				buildCreateScheduleStageRequestBody({
					stageParams,
					customerId,
					phases: getPhases(),
					unscheduledPlans: getUnscheduledPlans?.(),
					products,
					features,
					nowMs,
					resetBillingCycle: getResetBillingCycle?.() ?? false,
					...getBillingCycleAnchor?.(),
					endDate: getEndDate?.(),
					allowFirstPhaseBackdate: getAllowFirstPhaseBackdate?.() ?? false,
					enablePlanImmediately: getEnablePlanImmediately?.() ?? false,
					stripeSubscriptionId,
				}),
		[
			customerId,
			products,
			features,
			nowMs,
			getPhases,
			getUnscheduledPlans,
			getResetBillingCycle,
			getBillingCycleAnchor,
			getEndDate,
			getEnablePlanImmediately,
			getAllowFirstPhaseBackdate,
			stripeSubscriptionId,
		],
	);
}
