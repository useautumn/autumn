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

/**
 * Helper to create a UTC timestamp from week-based date.
 * Week 1 = first full Mon-Sun week of the month.
 *
 * January 2025 example:
 *   Mon Tue Wed Thu Fri Sat Sun
 *             1   2   3   4   5   <- (partial, before Week 1)
 *     6   7   8   9  10  11  12   <- Week 1
 *    13  14  15  16  17  18  19   <- Week 2
 *
 * { year: 2025, month: 1, week: 1, day: DayOfWeek.Mon } = Jan 6
 * { year: 2025, month: 1, week: 2, day: DayOfWeek.Tue } = Jan 14
 */
export const toUnixWeekly = ({
	year,
	month,
	week,
	day,
	hour = 12,
}: {
	year: number;
	month: number; // 1-indexed
	week: number; // 1-indexed (Week 1 = first full Mon-Sun week)
	day: DayOfWeek;
	hour?: number;
}): number => {
	const firstOfMonth = new UTCDate(year, month - 1, 1, hour, 0, 0);
	const firstDayOfMonth = firstOfMonth.getDay(); // 0=Sun, 1=Mon, ...

	// Find the first Monday of the month
	const daysToFirstMonday = (1 - firstDayOfMonth + 7) % 7;
	const firstMonday = 1 + daysToFirstMonday;

	// Week N starts on firstMonday + (N-1)*7
	const weekStart = firstMonday + (week - 1) * 7;

	// Day offset from Monday (Mon=0, Tue=1, ..., Sun=6)
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

/**
 * Helper to create a UTC timestamp from date components (1-indexed month)
 */
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

/**
 * Helper to extract date components from a unix timestamp
 */
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
