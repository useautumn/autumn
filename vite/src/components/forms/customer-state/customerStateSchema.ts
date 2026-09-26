import {
	BillingBehaviorSchema,
	type CustomizePlanLicense,
	type LicenseQuantityParams,
	type ProductItem,
} from "@autumn/shared";
import { z } from "zod/v4";

export const CustomerStatePlanSchema = z.object({
	productId: z.string().min(1),
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),
	items: z.custom<ProductItem[]>().nullable(),
	addLicenses: z.custom<CustomizePlanLicense[]>().nullable(),
	isCustom: z.boolean(),
	version: z.number().positive().optional(),
	// Only meaningful on the first phase — later phases inherit its scope.
	entityId: z.string().nullable().optional(),
	/** Seat totals per license, inclusive of included seats. */
	licenseQuantities: z.custom<LicenseQuantityParams[]>().optional(),

	// Sync only — carried over from what Stripe bills.
	/** Add-on instances to create from this row. */
	quantity: z.number().int().min(1).optional(),
});

export type CustomerStatePlan = z.infer<typeof CustomerStatePlanSchema>;

export const EMPTY_CUSTOMER_STATE_PLAN: CustomerStatePlan = {
	productId: "",
	prepaidOptions: {},
	items: null,
	addLicenses: null,
	isCustom: false,
	version: undefined,
	// null is customer-level: a plan picks its own scope, the sheet has none.
	entityId: null,
};

/** Where a plan row sits: in a phase, or among the unscheduled plans. */
export type PlanLocation =
	| { location: "phase"; phaseIndex: number; planIndex: number }
	| { location: "unscheduled"; planIndex: number };

export const CustomerStatePhaseSchema = z.object({
	startsAt: z.number().nullable(),
	persistedStartsAt: z.number().nullable().optional(),
	plans: z.array(CustomerStatePlanSchema).min(1),
});

export type CustomerStatePhase = z.infer<typeof CustomerStatePhaseSchema>;

export function hasPersistedCreateSchedule({
	phases,
}: {
	phases: CustomerStatePhase[];
}) {
	return phases[0]?.persistedStartsAt != null;
}

export function hasMultipleImmediateSchedulePlans({
	phases,
}: {
	phases: CustomerStatePhase[];
}) {
	const immediatePhase = phases.find((phase) =>
		phase.plans.some((plan) => plan.productId),
	);
	return (
		(immediatePhase?.plans.filter((plan) => plan.productId).length ?? 0) > 1
	);
}

export function canResetScheduleBillingCycle({
	phases,
}: {
	phases: CustomerStatePhase[];
}) {
	return (
		!hasMultipleImmediateSchedulePlans({ phases }) ||
		hasPersistedCreateSchedule({ phases })
	);
}

export function getCurrentCreateSchedulePhaseIndex({
	phases,
	nowMs = Date.now(),
}: {
	phases: CustomerStatePhase[];
	nowMs?: number;
}) {
	if (!hasPersistedCreateSchedule({ phases })) return null;

	let currentPhaseIndex: number | null = null;

	for (let i = 0; i < phases.length; i++) {
		const startsAt = phases[i]?.persistedStartsAt;
		if (startsAt == null || startsAt > nowMs) break;
		currentPhaseIndex = i;
	}

	return currentPhaseIndex;
}

export function hasCreateSchedulePhaseStarted({
	phases,
	phaseIndex,
	nowMs = Date.now(),
}: {
	phases: CustomerStatePhase[];
	phaseIndex: number;
	nowMs?: number;
}) {
	const currentPhaseIndex = getCurrentCreateSchedulePhaseIndex({
		phases,
		nowMs,
	});
	return currentPhaseIndex != null && phaseIndex <= currentPhaseIndex;
}

export function canCreateSchedulePhaseStartInPast({
	phases,
	phaseIndex,
	nowMs = Date.now(),
}: {
	phases: CustomerStatePhase[];
	phaseIndex: number;
	nowMs?: number;
}) {
	return hasCreateSchedulePhaseStarted({
		phases,
		phaseIndex,
		nowMs,
	});
}

export function isCreateSchedulePhaseLocked({
	phases,
	phaseIndex,
	nowMs = Date.now(),
}: {
	phases: CustomerStatePhase[];
	phaseIndex: number;
	nowMs?: number;
}) {
	const currentPhaseIndex = getCurrentCreateSchedulePhaseIndex({
		phases,
		nowMs,
	});
	return currentPhaseIndex != null && phaseIndex < currentPhaseIndex;
}

export function getCreateSchedulePhaseTimingError({
	phases,
	nowMs = Date.now(),
}: {
	phases: CustomerStatePhase[];
	nowMs?: number;
}) {
	let previousStartsAt = phases[0]?.startsAt ?? nowMs;

	for (let i = 1; i < phases.length; i++) {
		const startsAt = phases[i]?.startsAt;

		if (startsAt === null) {
			return "Pick a start date";
		}

		if (startsAt <= previousStartsAt) {
			return `Phase ${i + 1} must start after phase ${i}`;
		}

		if (
			!canCreateSchedulePhaseStartInPast({ phases, phaseIndex: i, nowMs }) &&
			startsAt <= nowMs
		) {
			return "Start date must be in the future";
		}

		previousStartsAt = startsAt;
	}

	return null;
}

export function getPhaseTimingError({
	phases,
	phaseIndex,
	nowMs = Date.now(),
}: {
	phases: CustomerStatePhase[];
	phaseIndex: number;
	nowMs?: number;
}): string | null {
	if (phaseIndex === 0) return null;

	const startsAt = phases[phaseIndex]?.startsAt;
	const previousStartsAt = phases[phaseIndex - 1]?.startsAt ?? nowMs;

	if (startsAt === null) return null; // no date picked yet — no error until submit

	if (startsAt <= previousStartsAt) {
		return `Must start after phase ${phaseIndex}`;
	}

	if (
		!canCreateSchedulePhaseStartInPast({ phases, phaseIndex, nowMs }) &&
		startsAt <= nowMs
	) {
		return "Must be in the future";
	}

	return null;
}

export const CustomerStateFormSchema = z
	.object({
		phases: z.array(CustomerStatePhaseSchema).min(1),
		/** Billed with the first phase, then left alone by the schedule. */
		unscheduledPlans: z.array(CustomerStatePlanSchema),
		billingBehavior: BillingBehaviorSchema.nullable(),
		resetBillingCycle: z.boolean(),
		enablePlanImmediately: z.boolean(),
	})
	.refine(
		(data) =>
			data.phases.every((phase, i) => i === 0 || phase.startsAt !== null),
		{ message: "All phases after the first must have a start date" },
	)
	.check((ctx) => {
		const timingError = getCreateSchedulePhaseTimingError({
			phases: ctx.value.phases,
		});
		if (timingError) {
			ctx.issues.push({
				code: "custom",
				message: timingError,
				input: ctx.value,
			});
		}
	});

export type CustomerStateForm = z.infer<typeof CustomerStateFormSchema>;
