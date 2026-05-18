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

export const tinybirdTimestampToEpochMs = (tsStr: string): number => {
	if (tsStr.endsWith("Z")) return new Date(tsStr).getTime();
	return new Date(`${tsStr.replace(" ", "T")}Z`).getTime();
};

export const tinybirdTimestampToEpochMicros = (tsStr: string): number => {
	const normalized = tsStr.endsWith("Z")
		? tsStr.slice(0, -1)
		: tsStr.replace(" ", "T");
	const dotIdx = normalized.indexOf(".");
	if (dotIdx === -1) {
		return new Date(`${normalized}Z`).getTime() * 1000;
	}
	const head = normalized.slice(0, dotIdx);
	const frac = normalized.slice(dotIdx + 1).padEnd(6, "0").slice(0, 6);
	const baseMs = new Date(`${head}Z`).getTime();
	return baseMs * 1000 + Number(frac);
};

export const epochMicrosToDateTime = (epochMicros: number): string => {
	const ms = Math.floor(epochMicros / 1000);
	const micros = epochMicros - ms * 1000;
	const date = new Date(ms);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");
	const sub = String(
		date.getUTCMilliseconds() * 1000 + micros,
	).padStart(6, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${sub}`;
};
