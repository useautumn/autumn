import type {
	BillingBehavior,
	CreateScheduleParamsV0,
	Feature,
	ProductV2,
} from "@autumn/shared";
import { useMemo } from "react";
import { applyCreateScheduleStageParams } from "@/components/forms/shared/utils/applyCreateScheduleStageParams";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import { buildCreateSchedulePlan } from "@/components/forms/shared/utils/buildPlanCustomize";
import {
	getCreateSchedulePhaseTimingError,
	hasPersistedCreateSchedule,
	type SchedulePhase,
} from "../createScheduleFormSchema";

export function buildCreateScheduleRequestBody({
	customerId,
	entityId,
	phases,
	products,
	features,
	nowMs,
	billingBehavior,
	resetBillingCycle,
	allowFirstPhaseBackdate,
}: {
	customerId: string | undefined;
	entityId: string | undefined;
	phases: SchedulePhase[];
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

		const plans = phase.plans
			.filter((plan) => plan.productId)
			.map((plan) =>
				buildCreateSchedulePlan({
					productId: plan.productId,
					prepaidOptions: plan.prepaidOptions,
					items: plan.items,
					version: plan.version,
					isCustom: plan.isCustom,
					product: products.find((product) => product.id === plan.productId),
					features,
				}),
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

	const body: Record<string, unknown> = {
		customer_id: customerId,
		phases: phasesWithBillingAnchors,
	};
	if (entityId) body.entity_id = entityId;

	// Top-level billing flags aren't supported when the immediate phase is a
	// multi-attach; future phase anchor resets are allowed for persisted schedules.
	const supportsBillingFlags = !hasMultipleImmediatePlans;
	if (supportsBillingFlags) {
		if (billingBehavior) body.billing_behavior = billingBehavior;
		if (resetBillingCycle && !hasPersistedSchedule) {
			body.billing_cycle_anchor = "now";
		}
	}
	return body as CreateScheduleParamsV0;
}

export function useCreateScheduleRequestBody({
	customerId,
	entityId,
	phases,
	products,
	features,
	nowMs,
	billingBehavior,
	resetBillingCycle,
	allowFirstPhaseBackdate,
}: {
	customerId: string | undefined;
	entityId: string | undefined;
	phases: SchedulePhase[];
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
				entityId,
				phases,
				products,
				features,
				nowMs,
				billingBehavior,
				resetBillingCycle,
				allowFirstPhaseBackdate,
			}),
		[
			customerId,
			entityId,
			phases,
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
	entityId,
	products,
	features,
	nowMs,
	getPhases,
	getBillingBehavior,
	getResetBillingCycle,
	getEnablePlanImmediately,
	getAllowFirstPhaseBackdate,
}: {
	customerId: string | undefined;
	entityId: string | undefined;
	products: ProductV2[];
	features: Feature[];
	nowMs?: number;
	getPhases: () => SchedulePhase[];
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
					entityId,
					phases: getPhases(),
					products,
					features,
					nowMs,
					billingBehavior: getBillingBehavior?.() ?? null,
					resetBillingCycle: getResetBillingCycle?.() ?? false,
					allowFirstPhaseBackdate: getAllowFirstPhaseBackdate?.() ?? false,
				});

				if (!requestBody) return null;

				return applyCreateScheduleStageParams({
					...stageParams,
					requestBody,
					enableProductImmediately:
						stageParams.enableProductImmediately ??
						(getEnablePlanImmediately?.() || undefined),
				});
			},
		[
			customerId,
			entityId,
			products,
			features,
			nowMs,
			getPhases,
			getBillingBehavior,
			getResetBillingCycle,
			getEnablePlanImmediately,
			getAllowFirstPhaseBackdate,
		],
	);
}
