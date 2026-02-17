/**
 * Time picker utilities adapted from openstatusHQ/time-picker (MIT).
 * Handles validation, clamping, arrow-key stepping and 12h/24h conversion.
 */

export type TimePickerType = "minutes" | "seconds" | "hours" | "12hours";
export type Period = "AM" | "PM";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidHour(value: string) {
	return /^(0[0-9]|1[0-9]|2[0-3])$/.test(value);
}

function isValid12Hour(value: string) {
	return /^(0[1-9]|1[0-2])$/.test(value);
}

function isValidMinuteOrSecond(value: string) {
	return /^[0-5][0-9]$/.test(value);
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

function getValidNumber({
	value,
	max,
	min = 0,
	loop = false,
}: {
	value: string;
	max: number;
	min?: number;
	loop?: boolean;
}) {
	let num = Number.parseInt(value, 10);
	if (Number.isNaN(num)) return "00";

	if (!loop) {
		if (num > max) num = max;
		if (num < min) num = min;
	} else {
		if (num > max) num = min;
		if (num < min) num = max;
	}
	return num.toString().padStart(2, "0");
}

function getValidHour(value: string) {
	if (isValidHour(value)) return value;
	return getValidNumber({ value, max: 23 });
}

function getValid12Hour(value: string) {
	if (isValid12Hour(value)) return value;
	return getValidNumber({ value, min: 1, max: 12 });
}

function getValidMinuteOrSecond(value: string) {
	if (isValidMinuteOrSecond(value)) return value;
	return getValidNumber({ value, max: 59 });
}

// ---------------------------------------------------------------------------
// Arrow-key stepping (with wrap-around)
// ---------------------------------------------------------------------------

function getValidArrowNumber({
	value,
	min,
	max,
	step,
}: {
	value: string;
	min: number;
	max: number;
	step: number;
}) {
	let num = Number.parseInt(value, 10);
	if (Number.isNaN(num)) return "00";
	num += step;
	return getValidNumber({ value: String(num), min, max, loop: true });
}

function getValidArrowHour({ value, step }: { value: string; step: number }) {
	return getValidArrowNumber({ value, min: 0, max: 23, step });
}

function getValidArrow12Hour({ value, step }: { value: string; step: number }) {
	return getValidArrowNumber({ value, min: 1, max: 12, step });
}

function getValidArrowMinuteOrSecond({
	value,
	step,
}: {
	value: string;
	step: number;
}) {
	return getValidArrowNumber({ value, min: 0, max: 59, step });
}

// ---------------------------------------------------------------------------
// Date setters
// ---------------------------------------------------------------------------

function setMinutes({ date, value }: { date: Date; value: string }) {
	const m = getValidMinuteOrSecond(value);
	date.setMinutes(Number.parseInt(m, 10));
	return date;
}

function setHours({ date, value }: { date: Date; value: string }) {
	const h = getValidHour(value);
	date.setHours(Number.parseInt(h, 10));
	return date;
}

function set12Hours({
	date,
	value,
	period,
}: {
	date: Date;
	value: string;
	period: Period;
}) {
	const hours = Number.parseInt(getValid12Hour(value), 10);
	const h24 = convert12HourTo24Hour({ hour: hours, period });
	date.setHours(h24);
	return date;
}

// ---------------------------------------------------------------------------
// Generic getter / setter by type
// ---------------------------------------------------------------------------

export function setDateByType({
	date,
	value,
	type,
	period,
}: {
	date: Date;
	value: string;
	type: TimePickerType;
	period?: Period;
}) {
	switch (type) {
		case "minutes":
			return setMinutes({ date, value });
		case "hours":
			return setHours({ date, value });
		case "12hours": {
			if (!period) return date;
			return set12Hours({ date, value, period });
		}
		default:
			return date;
	}
}

export function getDateByType({
	date,
	type,
}: {
	date: Date;
	type: TimePickerType;
}) {
	switch (type) {
		case "minutes":
			return getValidMinuteOrSecond(String(date.getMinutes()));
		case "hours":
			return getValidHour(String(date.getHours()));
		case "12hours": {
			const hours = display12HourValue(date.getHours());
			return getValid12Hour(String(hours));
		}
		default:
			return "00";
	}
}

export function getArrowByType({
	value,
	step,
	type,
}: {
	value: string;
	step: number;
	type: TimePickerType;
}) {
	switch (type) {
		case "minutes":
			return getValidArrowMinuteOrSecond({ value, step });
		case "hours":
			return getValidArrowHour({ value, step });
		case "12hours":
			return getValidArrow12Hour({ value, step });
		default:
			return "00";
	}
}

// ---------------------------------------------------------------------------
// 12h ↔ 24h conversion
// ---------------------------------------------------------------------------

function convert12HourTo24Hour({
	hour,
	period,
}: {
	hour: number;
	period: Period;
}) {
	if (period === "PM") {
		return hour <= 11 ? hour + 12 : hour;
	}
	if (period === "AM") {
		return hour === 12 ? 0 : hour;
	}
	return hour;
}

/** Map a 24-hour value to its 12-hour display string. */
export function display12HourValue(hours: number) {
	if (hours === 0 || hours === 12) return "12";
	if (hours >= 22) return `${hours - 12}`;
	if (hours % 12 > 9) return `${hours}`;
	return `0${hours % 12}`;
}
