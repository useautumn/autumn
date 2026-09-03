import type { BillingBehavior, ProductItem } from "@autumn/shared";
import { addMonths, addYears } from "date-fns";
import {
	type FieldReaders,
	overridesFromRequest,
	readArray,
	readNumber,
	readQuantities,
	readString,
	requestRecord,
} from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import type {
	CreateScheduleForm,
	SchedulePhase,
	SchedulePlan,
} from "../createScheduleFormSchema";

type RequestBody = Record<string, unknown>;

const PLAN_FIELD_READERS: FieldReaders<SchedulePlan> = {
	entityId: readString("entity_id"),
	items: readArray<ProductItem>("items"),
	productId: readString("plan_id"),
	version: readNumber("version"),
};

const planFrom = (value: unknown): SchedulePlan | undefined => {
	const plan = requestRecord(value);
	if (!plan || typeof plan.plan_id !== "string") return undefined;
	const overrides = overridesFromRequest(plan, PLAN_FIELD_READERS);
	return {
		entityId: overrides.entityId ?? null,
		isCustom: Array.isArray(plan.items),
		items: overrides.items ?? null,
		prepaidOptions:
			readQuantities("feature_quantities", "feature_id")(plan) ?? {},
		productId: plan.plan_id,
		version: overrides.version,
	};
};

const plansFrom = (value: unknown): SchedulePlan[] =>
	Array.isArray(value)
		? value.flatMap((plan) => {
				const mapped = planFrom(plan);
				return mapped ? [mapped] : [];
			})
		: [];

/** `starting_after` offsets fold forward from the prior phase's resolved
 * start; the immediate phase's "now" maps to the form's null convention. */
const startsAtFrom = ({
	phase,
	previousStartsAt,
}: {
	phase: RequestBody;
	previousStartsAt: number | null;
}): number | null => {
	if (typeof phase.starts_at === "number") return phase.starts_at;
	if (phase.starts_at === "now") return null;
	const offset = requestRecord(phase.starting_after);
	if (!offset || typeof offset.duration_count !== "number") return null;
	const base = previousStartsAt ?? Date.now();
	return offset.duration_type === "year"
		? addYears(base, offset.duration_count).getTime()
		: addMonths(base, offset.duration_count).getTime();
};

/** Inverse of the schedule request builder: maps a resolved create_schedule
 * request (per-plan customize already flattened to items) into form values. */
export const scheduleFormFromRequestBody = (
	request: RequestBody,
	persistedPhases: SchedulePhase[] = [],
): Partial<CreateScheduleForm> | undefined => {
	if (!Array.isArray(request.phases) || !request.phases.length)
		return undefined;
	const persistedStarts = new Set(
		persistedPhases.flatMap(({ persistedStartsAt }) =>
			persistedStartsAt == null ? [] : [persistedStartsAt],
		),
	);
	const firstPersistedStartsAt = persistedPhases[0]?.persistedStartsAt;
	let previousStartsAt: number | null = null;
	const phases = request.phases.flatMap((value, index) => {
		const phase = requestRecord(value);
		if (!phase) return [];
		const plans = plansFrom(phase.plans);
		if (!plans.length) return [];
		const generatedStartsAt = startsAtFrom({ phase, previousStartsAt });
		const startsAt =
			index === 0 &&
			firstPersistedStartsAt != null &&
			firstPersistedStartsAt <= Date.now()
				? firstPersistedStartsAt
				: generatedStartsAt;
		let persistedStartsAt: number | undefined;
		if (index === 0) persistedStartsAt = firstPersistedStartsAt;
		else if (startsAt != null && persistedStarts.has(startsAt))
			persistedStartsAt = startsAt;
		previousStartsAt = startsAt ?? previousStartsAt ?? Date.now();
		return [
			{
				plans,
				startsAt,
				...(persistedStartsAt != null ? { persistedStartsAt } : {}),
			},
		];
	});
	if (!phases.length) return undefined;
	return {
		billingBehavior:
			typeof request.billing_behavior === "string"
				? (request.billing_behavior as BillingBehavior)
				: null,
		enablePlanImmediately: request.enable_plan_immediately === true,
		phases,
		resetBillingCycle:
			request.billing_cycle_anchor === "now" ||
			request.phases.some(
				(value) => requestRecord(value)?.billing_cycle_anchor === "phase_start",
			),
		unscheduledPlans: plansFrom(request.unscheduled_plans),
	};
};
