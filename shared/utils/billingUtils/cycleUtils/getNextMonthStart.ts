import { UTCDate } from "@date-fns/utc";
import { addMonths, startOfMonth } from "date-fns";

export const getNextMonthStartMs = ({ epochMs }: { epochMs: number }) =>
	startOfMonth(addMonths(new UTCDate(epochMs), 1)).getTime();

export const isMonthStartMs = ({ epochMs }: { epochMs: number }) =>
	startOfMonth(new UTCDate(epochMs)).getTime() === epochMs;
