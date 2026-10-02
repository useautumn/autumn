import type {
	BillingBehavior,
	Feature,
	ProductV2,
	SetPlansParamsV0,
} from "@autumn/shared";
import { useMemo } from "react";
import { customerStatePlanToApiPlan } from "@/components/forms/customer-state/customerStatePlanToApiPlan";
import {
	type CustomerStateForm,
	type CustomerStatePhase,
	type CustomerStatePlan,
	getCreateSchedulePhaseTimingError,
	hasPersistedCreateSchedule,
} from "@/components/forms/customer-state/customerStateSchema";
import { applyMultiPlanStageParams } from "@/components/forms/shared/utils/applyMultiPlanStageParams";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import {
	type BillingCycleAnchorMode,
	resolveBillingCycleAnchor,
} from "@/components/forms/shared/utils/resolveBillingCycleAnchor";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
import { firstPhaseStartsLater } from "../utils/schedulePhaseTiming";

export function buildCreateScheduleRequestBody({
	customerId,
	phases,
	unscheduledPlans = [],
	products,
	features,
	nowMs,
	billingBehavior,
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
	billingBehavior?: BillingBehavior | null;
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
	const hasPersistedSchedule = hasPersistedCreateSchedule({ phases });
	const startsLater = firstPhaseStartsLater({ phases, nowMs: now });

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
					? phase.persistedStartsAt
					: (phase.startsAt ?? phase.persistedStartsAt);
		}
		if (startsAt === null) return null;

		const plans = phase.plans.flatMap((plan) =>
			plan.productId ? [toApiPlan(plan)] : [],
		);

		if (plans.length === 0) return null;
		return {
			starts_at: startsAt,
			plans,
		};
	});

	const validPhases = apiPhases.filter(
		(phase): phase is NonNullable<typeof phase> => phase !== null,
	);
	if (validPhases.length === 0) return null;

	const hasMultipleImmediatePlans = (validPhases[0]?.plans.length ?? 0) > 1;
	const pinsCustomAnchor = billingCycleAnchorMode === "custom";
	const canResetFuturePhases =
		resetBillingCycle &&
		!pinsCustomAnchor &&
		(!hasMultipleImmediatePlans || hasPersistedSchedule);
	const restartsAtFirstPhaseStart =
		resetBillingCycle && billingCycleAnchorMode === "phase_start";
	const phasesWithBillingAnchors = validPhases.map((phase, index) => ({
		...phase,
		...((index > 0 && canResetFuturePhases) ||
		(index === 0 && restartsAtFirstPhaseStart)
			? { billing_cycle_anchor: "phase_start" as const }
			: {}),
	}));

	const apiUnscheduledPlans = unscheduledPlans.flatMap((plan) =>
		plan.productId ? [toApiPlan(plan)] : [],
	);

	const body: Record<string, unknown> = {
		customer_id: customerId,
		phases: phasesWithBillingAnchors,
		...(apiUnscheduledPlans.length > 0
			? { unscheduled_plans: apiUnscheduledPlans }
			: {}),
	};

	if (billingBehavior) body.proration_behavior = billingBehavior;
	if (enablePlanImmediately && startsLater) body.enable_plan_immediately = true;
	if (stripeSubscriptionId) body.stripe_subscription_id = stripeSubscriptionId;
	if (endDate && hasPaidRecurringSchedulePlan({ phases, products })) {
		body.ends_at = endDate;
	}

	// Anchor resets aren't supported when the immediate phase is a multi-attach;
	// future phase anchor resets are allowed for persisted schedules.
	const billingCycleAnchor = resolveBillingCycleAnchor({
		resetBillingCycle: !!resetBillingCycle,
		billingCycleAnchorMode: billingCycleAnchorMode ?? "now",
		billingCycleAnchorDate: billingCycleAnchorDate ?? null,
	});
	if (
		!hasMultipleImmediatePlans &&
		!hasPersistedSchedule &&
		billingCycleAnchor !== undefined
	) {
		body.billing_cycle_anchor = billingCycleAnchor;
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
	billingBehavior,
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
	billingBehavior?: BillingBehavior | null;
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
				billingBehavior,
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
			billingBehavior,
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
	getBillingBehavior,
	getResetBillingCycle,
	getBillingCycleAnchorAndEndDate,
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
	getBillingBehavior?: () => BillingBehavior | null;
	getResetBillingCycle?: () => boolean;
	getBillingCycleAnchorAndEndDate?: () => Pick<
		CustomerStateForm,
		"billingCycleAnchorMode" | "billingCycleAnchorDate" | "endDate"
	>;
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
					billingBehavior: getBillingBehavior?.() ?? null,
					resetBillingCycle: getResetBillingCycle?.() ?? false,
					...getBillingCycleAnchorAndEndDate?.(),
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
			getBillingBehavior,
			getResetBillingCycle,
			getBillingCycleAnchorAndEndDate,
			getEnablePlanImmediately,
			getAllowFirstPhaseBackdate,
			stripeSubscriptionId,
		],
	);
}
