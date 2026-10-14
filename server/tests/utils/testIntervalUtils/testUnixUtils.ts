import { UTCDate } from "@date-fns/utc";

export enum DayOfWeek {
	Mon = 1,
	Tue = 2,
	Wed = 3,
	Thu = 4,
	Fri = 5,
	Sat = 6,
	Sun = 0,
}

export const toUnixWeekly = ({
	year,
	month,
	week,
	day,
	hour = 12,
}: {
	year: number;
	month: number;
	week: number;
	day: DayOfWeek;
	hour?: number;
}): number => {
	const firstOfMonth = new UTCDate(year, month - 1, 1, hour, 0, 0);
	const firstDayOfMonth = firstOfMonth.getDay();
	const daysToFirstMonday = (1 - firstDayOfMonth + 7) % 7;
	const firstMonday = 1 + daysToFirstMonday;

	const weekStart = firstMonday + (week - 1) * 7;

	const dayOffset = (day - 1 + 7) % 7;

	return new UTCDate(
		year,
		month - 1,
		weekStart + dayOffset,
		hour,
		0,
		0,
	).getTime();
};

export const toUnix = ({
	year,
	month,
	day,
	hour = 12,
	minute = 0,
	second = 0,
}: {
	year: number;
	month: number;
	day: number;
	hour?: number;
	minute?: number;
	second?: number;
}): number => {
	return new UTCDate(year, month - 1, day, hour, minute, second).getTime();
};

export const fromUnix = (unix: number) => {
	const date = new UTCDate(unix);
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
		dayOfWeek: date.getDay() as DayOfWeek,
		hour: date.getHours(),
		minute: date.getMinutes(),
		second: date.getSeconds(),
	};
};
