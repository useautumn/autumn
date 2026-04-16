import type { ProductItem } from "@autumn/shared";
import { z } from "zod/v4";

export const SchedulePlanSchema = z.object({
	productId: z.string().min(1),
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),
	items: z.custom<ProductItem[]>().nullable(),
	isCustom: z.boolean(),
	version: z.number().positive().optional(),
});

export type SchedulePlan = z.infer<typeof SchedulePlanSchema>;

export const EMPTY_SCHEDULE_PLAN: SchedulePlan = {
	productId: "",
	prepaidOptions: {},
	items: null,
	isCustom: false,
	version: undefined,
};

export const SchedulePhaseSchema = z.object({
	startsAt: z.number().nullable(),
	persistedStartsAt: z.number().nullable().optional(),
	plans: z.array(SchedulePlanSchema).min(1),
});

export type SchedulePhase = z.infer<typeof SchedulePhaseSchema>;

export function hasPersistedCreateSchedule({
	phases,
}: {
	phases: SchedulePhase[];
}) {
	return phases[0]?.persistedStartsAt != null;
}

export function getCurrentCreateSchedulePhaseIndex({
	phases,
	nowMs = Date.now(),
}: {
	phases: SchedulePhase[];
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
	phases: SchedulePhase[];
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
	phases: SchedulePhase[];
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
	phases: SchedulePhase[];
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
	phases: SchedulePhase[];
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
	phases: SchedulePhase[];
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

export const CreateScheduleFormSchema = z
	.object({
		phases: z.array(SchedulePhaseSchema).min(1),
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

export type CreateScheduleForm = z.infer<typeof CreateScheduleFormSchema>;
