import {
	addDuration,
	type CreateScheduleParamsV0,
	ErrCode,
	ms,
	RecaseError,
	type ResolvedCreateSchedulePhaseV0,
} from "@autumn/shared";

type CreateSchedulePhase = CreateScheduleParamsV0["phases"][number];
type ResolvedPhase = ResolvedCreateSchedulePhaseV0;

const hasRelativeTiming = ({
	phases,
}: {
	phases: CreateScheduleParamsV0["phases"];
}) =>
	phases.some(
		(phase) => phase.starts_at === "now" || phase.starting_after !== undefined,
	);

type NumericStartPhase = CreateSchedulePhase & { starts_at: number };

export const phaseHasNumericStart = (
	phase: CreateSchedulePhase,
): phase is NumericStartPhase => typeof phase.starts_at === "number";

const assertStrictlyIncreasing = ({ phases }: { phases: ResolvedPhase[] }) => {
	for (let index = 1; index < phases.length; index++) {
		const previousPhase = phases[index - 1];
		const currentPhase = phases[index];

		if (previousPhase && currentPhase?.starts_at <= previousPhase.starts_at) {
			throw new RecaseError({
				message: "Phase starts_at values must be strictly increasing",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};

const phaseToResolvedPhase = ({
	phase,
	startsAt,
}: {
	phase: CreateSchedulePhase;
	startsAt: number;
}): ResolvedPhase => {
	const { starting_after: _startingAfter, ...resolvedPhase } = phase;
	return {
		...resolvedPhase,
		starts_at: startsAt,
	};
};

const toNonEmptyResolvedPhases = ({
	phases,
}: {
	phases: ResolvedPhase[];
}): [ResolvedPhase, ...ResolvedPhase[]] => {
	const [firstPhase, ...remainingPhases] = phases;

	if (!firstPhase) {
		throw new RecaseError({
			message: "Create schedule requires at least one phase",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return [firstPhase, ...remainingPhases];
};

export const getInitialCreateSchedulePhase = ({
	phases,
}: {
	phases: CreateScheduleParamsV0["phases"];
}): CreateSchedulePhase => {
	const [firstPhase] = hasRelativeTiming({ phases })
		? [...phases]
		: [...phases].sort((a, b) => {
				if (!phaseHasNumericStart(a)) {
					return 0;
				}
				if (!phaseHasNumericStart(b)) {
					return 0;
				}

				return a.starts_at - b.starts_at;
			});

	if (!firstPhase) {
		throw new RecaseError({
			message: "Create schedule requires at least one phase",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return firstPhase;
};

const CYCLE_BOUNDARY_SNAP_WINDOW_MS = ms.hours(12);

const snapResolvedPhasesToCycleBoundary = ({
	phases,
	cycleBoundaryMs,
}: {
	phases: ResolvedPhase[];
	cycleBoundaryMs: number;
}): ResolvedPhase[] => {
	let snapIndex = -1;
	let snapDistance = CYCLE_BOUNDARY_SNAP_WINDOW_MS;
	for (let index = 1; index < phases.length; index++) {
		const phase = phases[index];
		if (!phase) continue;
		const distance = Math.abs(phase.starts_at - cycleBoundaryMs);
		if (distance <= snapDistance) {
			snapDistance = distance;
			snapIndex = index;
		}
	}

	if (snapIndex === -1) return phases;

	const previousPhase = phases[snapIndex - 1];
	const nextPhase = phases[snapIndex + 1];
	if (previousPhase && cycleBoundaryMs <= previousPhase.starts_at)
		return phases;
	if (nextPhase && cycleBoundaryMs >= nextPhase.starts_at) return phases;

	return phases.map((phase, index) =>
		index === snapIndex ? { ...phase, starts_at: cycleBoundaryMs } : phase,
	);
};

/** Sort phases for downstream create_schedule setup and execution. */
export const normalizeCreateSchedulePhases = ({
	phases,
	currentEpochMs,
	cycleBoundaryMs,
}: {
	phases: CreateScheduleParamsV0["phases"];
	currentEpochMs: number;
	cycleBoundaryMs?: number;
}): [ResolvedPhase, ...ResolvedPhase[]] => {
	const orderedPhases = hasRelativeTiming({ phases })
		? [...phases]
		: [...phases].sort((a, b) => {
				if (!phaseHasNumericStart(a)) {
					return 0;
				}
				if (!phaseHasNumericStart(b)) {
					return 0;
				}

				return a.starts_at - b.starts_at;
			});

	const resolvedPhases: ResolvedPhase[] = [];

	for (const phase of orderedPhases) {
		let startsAt: number;

		if (phase.starts_at === "now") {
			startsAt = currentEpochMs;
		} else if (phaseHasNumericStart(phase)) {
			startsAt = phase.starts_at;
		} else if (phase.starting_after) {
			const previousPhase = resolvedPhases[resolvedPhases.length - 1];
			if (!previousPhase) {
				throw new RecaseError({
					message: "starting_after cannot be used on the first phase",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			startsAt = addDuration({
				now: previousPhase.starts_at,
				durationType: phase.starting_after.duration_type,
				durationLength: phase.starting_after.duration_count,
			});
		} else {
			throw new RecaseError({
				message:
					"Each phase must include exactly one of starts_at or starting_after",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		resolvedPhases.push(phaseToResolvedPhase({ phase, startsAt }));
	}

	const snappedPhases =
		cycleBoundaryMs === undefined
			? resolvedPhases
			: snapResolvedPhasesToCycleBoundary({
					phases: resolvedPhases,
					cycleBoundaryMs,
				});

	assertStrictlyIncreasing({ phases: snappedPhases });

	return toNonEmptyResolvedPhases({ phases: snappedPhases });
};
