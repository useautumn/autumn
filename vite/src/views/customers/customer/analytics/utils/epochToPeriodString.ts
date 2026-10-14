const pad = (value: number): string => String(value).padStart(2, "0");

export const isUtcBin = ({
	binSize,
	timezone,
}: {
	binSize: string;
	timezone: string;
}) => binSize === "hour" || timezone === "UTC";

export const epochToPeriodString = ({
	epochMs,
	utc,
}: {
	epochMs: number;
	utc: boolean;
}): string => {
	const date = new Date(epochMs);
	const parts = utc
		? [
				date.getUTCFullYear(),
				date.getUTCMonth() + 1,
				date.getUTCDate(),
				date.getUTCHours(),
				date.getUTCMinutes(),
				date.getUTCSeconds(),
			]
		: [
				date.getFullYear(),
				date.getMonth() + 1,
				date.getDate(),
				date.getHours(),
				date.getMinutes(),
				date.getSeconds(),
			];
	const [year, month, day, hours, minutes, seconds] = parts;
	return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};
