import {
	type CreateScheduleParamsV0,
	CreateScheduleParamsV0Schema,
	StartingAfterDuration,
} from "@autumn/shared";
import { normalizeCreateSchedulePhases } from "../../../server/src/internal/billing/v2/actions/createSchedule/errors/normalizeCreateSchedulePhases.js";
import { addDuration } from "../../../shared/utils/billingUtils/intervalUtils/addDuration.js";
import type { ToolCall } from "./context.js";

const FIRST_PHASE_TOLERANCE_MS = 15 * 60 * 1000;
/** A model rendering a calendar date in a local offset lands within a day of
 * the intended UTC midnight; snap to the date the user wrote, or to an exact
 * whole-month/year boundary from the previous phase. Only real UTC-midnight
 * targets qualify, never arbitrary epochs. */
const USER_DATE_SNAP_MS = 24 * 60 * 60 * 1000;
/** Model drift accumulates across phases (each off by hours); boundaries
 * are ≥28 days apart so a 3-day window cannot pick the wrong one. */
const BOUNDARY_SNAP_MS = 3 * 24 * 60 * 60 * 1000;

/** Numeric first-phase starts that are neither "now" nor a date the user
 * actually wrote are guesses; the real API rejects future starts and the
 * agent must not invent a backdate. */
export const normalizeScheduleTiming = ({
	actions,
	today,
	userDateEpochsMs = [],
}: {
	actions: ToolCall[];
	today: Date | string;
	userDateEpochsMs?: readonly number[];
}): ToolCall[] => {
	const cloned = structuredClone(actions);
	for (const action of cloned) {
		if (action.name !== "createSchedule") continue;
		const currentEpochMs =
			today instanceof Date ? today.getTime() : Date.parse(today);
		if (!Number.isFinite(currentEpochMs))
			throw new Error(
				"Schedule normalization requires a valid preparation date",
			);
		CreateScheduleParamsV0Schema.parse(action.args.request);
		const request = action.args.request as CreateScheduleParamsV0;
		const snapTargets = (previous: number | undefined) => [
			...userDateEpochsMs,
			...(previous === undefined
				? []
				: [StartingAfterDuration.Month, StartingAfterDuration.Year].flatMap(
						(durationType) =>
							[1, 2, 3, 6, 12].map((durationLength) =>
								addDuration({ now: previous, durationType, durationLength }),
							),
					)),
		];
		const snapToWrittenDate = (startsAt: number, previous?: number) =>
			snapTargets(previous).find(
				(epoch) =>
					startsAt !== epoch &&
					epoch % USER_DATE_SNAP_MS === 0 &&
					Math.abs(startsAt - epoch) <
						(userDateEpochsMs.includes(epoch)
							? USER_DATE_SNAP_MS
							: BOUNDARY_SNAP_MS),
			) ?? startsAt;
		for (const phase of request.phases)
			if (typeof phase.starts_at === "number")
				phase.starts_at = snapToWrittenDate(phase.starts_at);
		const numericStarts = request.phases.flatMap((phase) =>
			typeof phase.starts_at === "number" ? [phase.starts_at] : [],
		);
		const relative = request.phases.some(
			(phase) => phase.starts_at === "now" || phase.starting_after,
		);
		const firstStart = relative
			? request.phases[0].starts_at
			: numericStarts.length
				? Math.min(...numericStarts)
				: undefined;
		if (typeof firstStart === "number") {
			const nearNow =
				Math.abs(firstStart - currentEpochMs) <= FIRST_PHASE_TOLERANCE_MS;
			const grounded = userDateEpochsMs.includes(firstStart);
			if (!nearNow && !grounded)
				throw new Error(
					`The first phase starts_at ${new Date(firstStart).toISOString()} is neither the current date nor a date the user supplied. Use starts_at: "now" unless the user explicitly gave a past start date; the API rejects future first phases.`,
				);
		}
		let previousStart: number | undefined;
		request.phases = normalizeCreateSchedulePhases({
			phases: request.phases,
			currentEpochMs,
		}).map((phase) => {
			const startsAt = snapToWrittenDate(phase.starts_at, previousStart);
			previousStart = startsAt;
			return { ...phase, starts_at: startsAt };
		}) as typeof request.phases;
	}
	return cloned;
};
