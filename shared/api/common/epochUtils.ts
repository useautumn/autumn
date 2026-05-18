/** Converts epoch ms to DateTime string format (YYYY-MM-DD HH:MM:SS) */
export const epochToDateTime = (epochMs: number): string => {
	const date = new Date(epochMs);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Sub-second precision form for ClickHouse DateTime64. Cursor boundaries
// against high-resolution columns lose rows when truncated to whole seconds.
export const epochToDateTimeMillis = (epochMs: number): string => {
	const date = new Date(epochMs);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");
	const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
};

// ClickHouse `DateTime64` row JSON omits the trailing `Z` even though values
// are stored in UTC. JS Date treats unsuffixed strings as local time, so we
// pin to UTC explicitly to keep the epoch consistent with how the column
// was written.
export const tinybirdTimestampToEpochMs = (tsStr: string): number => {
	if (tsStr.endsWith("Z")) return new Date(tsStr).getTime();
	return new Date(`${tsStr.replace(" ", "T")}Z`).getTime();
};
