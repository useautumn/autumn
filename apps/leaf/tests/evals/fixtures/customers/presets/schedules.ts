import { baseSchedule } from "../base/baseSchedule.js";

type ScheduleArgs = Parameters<typeof baseSchedule>[0];

export const schedules = {
	customer: (args: ScheduleArgs) => baseSchedule(args),
	entity: (args: Omit<ScheduleArgs, "entityId"> & { entityId: string }) =>
		baseSchedule(args),
} as const;
