import { UTCDate } from "@date-fns/utc";
import { addMonths, startOfMonth } from "date-fns";

/** The 1st of the month after `epochMs`, at 00:00 UTC. */
export const getNextMonthStartMs = ({ epochMs }: { epochMs: number }) =>
	startOfMonth(addMonths(new UTCDate(epochMs), 1)).getTime();

/** Whether `epochMs` is exactly the 1st of a month at 00:00 UTC. */
export const isMonthStartMs = ({ epochMs }: { epochMs: number }) =>
	startOfMonth(new UTCDate(epochMs)).getTime() === epochMs;
