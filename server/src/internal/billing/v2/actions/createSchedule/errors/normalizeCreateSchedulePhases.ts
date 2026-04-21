import type { CreateScheduleParamsV0 } from "@autumn/shared";

type CreateSchedulePhase = CreateScheduleParamsV0["phases"][number];

/** Sort phases for downstream create_schedule setup and execution. */
export const normalizeCreateSchedulePhases = ({
	phases,
}: {
	phases: CreateScheduleParamsV0["phases"];
}): [CreateSchedulePhase, ...CreateSchedulePhase[]] => {
	return [...phases].sort((a, b) => a.starts_at - b.starts_at) as [
		CreateSchedulePhase,
		...CreateSchedulePhase[],
	];
};
