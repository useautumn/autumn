import type {
	BillingBehavior,
	CreateScheduleParamsV0,
	Feature,
	ProductV2,
} from "@autumn/shared";
import { useMemo } from "react";
import { applyMultiPlanStageParams } from "@/components/forms/shared/utils/applyMultiPlanStageParams";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import { buildBillingPlan } from "@/components/forms/shared/utils/buildPlanCustomize";
import {
	getCreateSchedulePhaseTimingError,
	hasPersistedCreateSchedule,
	type SchedulePhase,
	type SchedulePlan,
} from "../createScheduleFormSchema";

export function buildCreateScheduleRequestBody({
	customerId,
	phases,
	unscheduledPlans = [],
	products,
	features,
	nowMs,
	billingBehavior,
	resetBillingCycle,
	allowFirstPhaseBackdate,
}: {
	customerId: string | undefined;
	phases: SchedulePhase[];
	unscheduledPlans?: SchedulePlan[];
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	billingBehavior?: BillingBehavior | null;
	resetBillingCycle?: boolean;
	allowFirstPhaseBackdate?: boolean;
}): CreateScheduleParamsV0 | null {
	const now = nowMs ?? Date.now();
	if (!customerId || phases.length === 0) return null;
	if (getCreateSchedulePhaseTimingError({ phases, nowMs: now })) return null;
	const hasPersistedSchedule = hasPersistedCreateSchedule({ phases });

	const apiPhases = phases.map((phase, index) => {
		let startsAt = phase.startsAt;
		if (index === 0) {
			startsAt = allowFirstPhaseBackdate
				? (phase.startsAt ?? now)
				: (phase.persistedStartsAt ?? now);
		}
		if (startsAt === null) return null;

		const plans = phase.plans.flatMap((plan) =>
			plan.productId
				? [
						buildBillingPlan({
							productId: plan.productId,
							prepaidOptions: plan.prepaidOptions,
							items: plan.items,
							version: plan.version,
							isCustom: plan.isCustom,
							// Scope is per plan and always explicit; later phases inherit it.
							entityId: index === 0 ? (plan.entityId ?? null) : undefined,
							product: products.find(
								(product) => product.id === plan.productId,
							),
							features,
						}),
					]
				: [],
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
	const canResetFuturePhases =
		resetBillingCycle && (!hasMultipleImmediatePlans || hasPersistedSchedule);
	const phasesWithBillingAnchors = validPhases.map((phase, index) => ({
		...phase,
		...(index > 0 && canResetFuturePhases
			? { billing_cycle_anchor: "phase_start" as const }
			: {}),
	}));

	const apiUnscheduledPlans = unscheduledPlans.flatMap((plan) =>
		plan.productId
			? [
					buildBillingPlan({
						productId: plan.productId,
						prepaidOptions: plan.prepaidOptions,
						items: plan.items,
						version: plan.version,
						isCustom: plan.isCustom,
						entityId: plan.entityId ?? null,
						product: products.find((product) => product.id === plan.productId),
						features,
					}),
				]
			: [],
	);

	const body: Record<string, unknown> = {
		customer_id: customerId,
		phases: phasesWithBillingAnchors,
		...(apiUnscheduledPlans.length > 0
			? { unscheduled_plans: apiUnscheduledPlans }
			: {}),
	};

	if (billingBehavior) body.billing_behavior = billingBehavior;

	// Anchor resets aren't supported when the immediate phase is a multi-attach;
	// future phase anchor resets are allowed for persisted schedules.
	if (
		!hasMultipleImmediatePlans &&
		resetBillingCycle &&
		!hasPersistedSchedule
	) {
		body.billing_cycle_anchor = "now";
	}
	return body as CreateScheduleParamsV0;
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
	allowFirstPhaseBackdate,
}: {
	customerId: string | undefined;
	phases: SchedulePhase[];
	unscheduledPlans?: SchedulePlan[];
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	billingBehavior?: BillingBehavior | null;
	resetBillingCycle?: boolean;
	allowFirstPhaseBackdate?: boolean;
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
				allowFirstPhaseBackdate,
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
			allowFirstPhaseBackdate,
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
	getEnablePlanImmediately,
	getAllowFirstPhaseBackdate,
}: {
	customerId: string | undefined;
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	getPhases: () => SchedulePhase[];
	getUnscheduledPlans?: () => SchedulePlan[];
	getBillingBehavior?: () => BillingBehavior | null;
	getResetBillingCycle?: () => boolean;
	getEnablePlanImmediately?: () => boolean;
	getAllowFirstPhaseBackdate?: () => boolean;
}) {
	return useMemo(
		() =>
			(stageParams: BillingStageParams = {}): CreateScheduleParamsV0 | null => {
				const requestBody = buildCreateScheduleRequestBody({
					customerId,
					phases: getPhases(),
					unscheduledPlans: getUnscheduledPlans?.(),
					products,
					features,
					nowMs,
					billingBehavior: getBillingBehavior?.() ?? null,
					resetBillingCycle: getResetBillingCycle?.() ?? false,
					allowFirstPhaseBackdate: getAllowFirstPhaseBackdate?.() ?? false,
				});

				if (!requestBody) return null;

				return applyMultiPlanStageParams({
					...stageParams,
					requestBody,
					enableProductImmediately:
						stageParams.enableProductImmediately ??
						(getEnablePlanImmediately?.() || undefined),
				});
			},
		[
			customerId,
			products,
			features,
			nowMs,
			getPhases,
			getUnscheduledPlans,
			getBillingBehavior,
			getResetBillingCycle,
			getEnablePlanImmediately,
			getAllowFirstPhaseBackdate,
		],
	);
}
