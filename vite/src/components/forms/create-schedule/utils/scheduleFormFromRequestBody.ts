import {
	type AttachDiscount,
	type BillingBehavior,
	BillingBehaviorSchema,
	type CustomizePlanLicense,
	FreeTrialDuration,
	type ProductItem,
} from "@autumn/shared";
import { addMonths, addYears } from "date-fns";
import type {
	CustomerStateForm,
	CustomerStatePhase,
	CustomerStatePlan,
} from "@/components/forms/customer-state/customerStateSchema";
import { DISABLED_FREE_TRIAL_FORM_VALUES } from "@/components/forms/shared/utils/freeTrialFormValues";
import {
	carryOverFrom,
	type FieldReaders,
	overridesFromRequest,
	readArray,
	readNumber,
	readQuantities,
	readRewardIds,
	readStampedArray,
	readString,
	requestRecord,
} from "@/components/forms/shared/utils/requestBodyOverrideHelpers";
import { billingCycleAnchorToKeepsCycleAnchor } from "./phaseBillingCycleAnchor";

type RequestBody = Record<string, unknown>;

const PLAN_FIELD_READERS: FieldReaders<CustomerStatePlan> = {
	entityId: readString("entity_id"),
	items: readArray<ProductItem>("items"),
	productId: readString("plan_id"),
	version: readNumber("version"),
};

const upsertLicensesFrom = (plan: Record<string, unknown>) => {
	const customize = requestRecord(plan.customize);
	const upsertLicenses = customize?.upsert_licenses;
	return Array.isArray(upsertLicenses)
		? (upsertLicenses as CustomizePlanLicense[])
		: null;
};

const planFrom = (value: unknown): CustomerStatePlan | undefined => {
	const plan = requestRecord(value);
	if (!plan || typeof plan.plan_id !== "string") return undefined;
	const overrides = overridesFromRequest(plan, PLAN_FIELD_READERS);
	return {
		entityId: overrides.entityId ?? null,
		isCustom: Array.isArray(plan.items),
		items: overrides.items ?? null,
		addLicenses: upsertLicensesFrom(plan),
		prepaidOptions:
			readQuantities("feature_quantities", "feature_id")(plan) ?? {},
		licenseQuantities:
			readQuantities("license_quantities", "license_plan_id")(plan) ?? {},
		productId: plan.plan_id,
		version: overrides.version,
	};
};

const prorationBehaviorFrom = (value: unknown): BillingBehavior | null =>
	BillingBehaviorSchema.safeParse(value).data ?? null;

const plansFrom = (value: unknown): CustomerStatePlan[] =>
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

const isFreeTrialDuration = (value: unknown): value is FreeTrialDuration =>
	Object.values(FreeTrialDuration).includes(value as FreeTrialDuration);

/** `null` ends a running trial and an object starts one; an omitted trial leaves the row as seeded. */
const freeTrialFrom = (
	value: unknown,
): Partial<CustomerStateForm> | undefined => {
	if (value === null) {
		return { ...DISABLED_FREE_TRIAL_FORM_VALUES, trialEdited: true };
	}
	const freeTrial = requestRecord(value);
	if (!freeTrial || typeof freeTrial.duration_length !== "number") {
		return undefined;
	}
	return {
		trialEnabled: true,
		trialLength: freeTrial.duration_length,
		trialDuration: isFreeTrialDuration(freeTrial.duration_type)
			? freeTrial.duration_type
			: FreeTrialDuration.Month,
		trialCardRequired: freeTrial.card_required === true,
		trialEdited: true,
	};
};

/** Inverse of the schedule request builder: maps a resolved set_plans
 * request (per-plan customize already flattened to items) into form values. */
export const scheduleFormFromRequestBody = (
	request: RequestBody,
	persistedPhases: CustomerStatePhase[] = [],
): Partial<CustomerStateForm> | undefined => {
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
		if (index === 0) persistedStartsAt = firstPersistedStartsAt ?? undefined;
		else if (startsAt != null && persistedStarts.has(startsAt))
			persistedStartsAt = startsAt;
		previousStartsAt = startsAt ?? previousStartsAt ?? Date.now();
		return [
			{
				plans,
				startsAt,
				keepsCycleAnchor: billingCycleAnchorToKeepsCycleAnchor({
					billingCycleAnchor: phase.billing_cycle_anchor,
					isFirstPhase: index === 0,
				}),
				prorationBehavior: prorationBehaviorFrom(
					phase.proration_behavior ??
						(index === 0 ? request.billing_behavior : undefined),
				),
				...(persistedStartsAt != null ? { persistedStartsAt } : {}),
			},
		];
	});
	if (!phases.length) return undefined;
	const firstPhase = requestRecord(request.phases[0]);
	const firstPhaseAnchor =
		firstPhase?.billing_cycle_anchor ?? request.billing_cycle_anchor;
	const customAnchor =
		typeof firstPhaseAnchor === "number" ? firstPhaseAnchor : null;
	return {
		enablePlanImmediately: request.enable_plan_immediately === true,
		endDate: readNumber("ends_at")(request) ?? null,
		phases,
		resetBillingCycle: firstPhaseAnchor !== undefined,
		billingCycleAnchorMode: customAnchor === null ? "now" : "custom",
		billingCycleAnchorDate: customAnchor,
		unscheduledPlans: plansFrom(request.unscheduled_plans),
		...carryOverFrom<CustomerStateForm>(request.carry_over_usages, {
			enabled: "carryOverUsages",
			featureIds: "carryOverUsageFeatureIds",
		}),
		...freeTrialFrom(request.free_trial),
		...overridesFromRequest<CustomerStateForm>(request, {
			discounts: readStampedArray<AttachDiscount>(
				"discounts",
				"seeded-discount",
			),
			removedRewardIds: readRewardIds("remove_discounts"),
		}),
	};
};
