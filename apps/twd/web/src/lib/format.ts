import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const sha7 = (sha: string) => sha.slice(0, 7);

export const formatMs = (ms: number | null | undefined) => {
	if (ms === null || ms === undefined) return "—";
	if (ms < 1_000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
	const m = Math.floor(ms / 60_000);
	const s = Math.round((ms % 60_000) / 1_000);
	if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const elapsed = ({
	from,
	to,
	now,
}: {
	from: string | null;
	to: string | null;
	now: number;
}) =>
	from
		? formatMs(Math.max(0, (to ? Date.parse(to) : now) - Date.parse(from)))
		: "—";

export const timeAgo = (value: string | null, now = Date.now()) => {
	if (!value) return "never";
	const diff = Date.parse(value) - now;
	const abs = Math.abs(diff);
	const fmt = new Intl.RelativeTimeFormat("en", {
		numeric: "auto",
		style: "short",
	});
	if (abs < 60_000) return "just now";
	if (abs < 3_600_000) return fmt.format(Math.round(diff / 60_000), "minute");
	if (abs < 86_400_000) return fmt.format(Math.round(diff / 3_600_000), "hour");
	return fmt.format(Math.round(diff / 86_400_000), "day");
};

export const formatDate = (value: string | null) =>
	value
		? new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			}).format(new Date(value))
		: "—";

export const num = (n: number) => new Intl.NumberFormat("en").format(n);

export const handle = (email: string) => email.split("@")[0];

/** `api_key:<id>` → API key actor (agent/CI); `session` → human. */
export const isAgentVia = (via: string) => via.startsWith("api_key");
