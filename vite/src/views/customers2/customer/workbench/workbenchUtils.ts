import type { RequestLogEntry } from "@/hooks/queries/useCusRequestLogsQuery";

export const statusBadgeClass = (status: number): string => {
	if (status >= 200 && status < 300) {
		return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900";
	}
	if (status >= 300 && status < 400) {
		return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900";
	}
	if (status >= 400 && status < 500) {
		return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900";
	}
	return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900";
};

export const statusText = (status: number): string => {
	if (status === 200) return "200 OK";
	if (status === 201) return "201 Created";
	if (status === 204) return "204 No Content";
	if (status === 400) return "400 Bad Request";
	if (status === 401) return "401 Unauthorized";
	if (status === 403) return "403 Forbidden";
	if (status === 404) return "404 Not Found";
	if (status === 409) return "409 Conflict";
	if (status === 422) return "422 Unprocessable";
	if (status === 429) return "429 Rate Limited";
	if (status === 500) return "500 Server Error";
	return String(status);
};

export const methodColorClass = (method: string | null): string => {
	switch (method) {
		case "GET":
			return "text-blue-600 dark:text-blue-400";
		case "POST":
			return "text-emerald-600 dark:text-emerald-400";
		case "PUT":
			return "text-amber-600 dark:text-amber-400";
		case "PATCH":
			return "text-purple-600 dark:text-purple-400";
		case "DELETE":
			return "text-red-600 dark:text-red-400";
		default:
			return "text-muted-foreground";
	}
};

const dayBucketLabel = (date: Date, now: Date): string => {
	const y = date.toDateString() === now.toDateString();
	if (y) return "Today";

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
};

export const groupLogsByDay = (
	logs: RequestLogEntry[],
): { label: string; entries: RequestLogEntry[] }[] => {
	const now = new Date();
	const groups = new Map<string, RequestLogEntry[]>();

	for (const log of logs) {
		const d = new Date(log.time);
		const label = dayBucketLabel(d, now);
		const existing = groups.get(label) ?? [];
		existing.push(log);
		groups.set(label, existing);
	}

	return Array.from(groups.entries()).map(([label, entries]) => ({
		label,
		entries,
	}));
};

export const formatLogTime = (time: string): string =>
	new Date(time).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

export const formatLogDateTime = (time: string): string =>
	new Date(time).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	v != null && typeof v === "object" && !Array.isArray(v);

export const extractScope = (
	raw: Record<string, unknown>,
	prefix: string,
): Record<string, unknown> => {
	const base = prefix.replace(/\.$/, "");
	const direct = raw[base];
	if (isPlainObject(direct)) return direct;

	const dotted = `${base}.`;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (k.startsWith(dotted)) {
			out[k.slice(dotted.length)] = v;
		}
	}
	return out;
};

export const extractRes = (raw: Record<string, unknown>): unknown => {
	if (raw.res !== undefined) return raw.res ?? {};
	return extractScope(raw, "res");
};
