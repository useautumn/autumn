import type { RunSummary } from "../../../../src/api/contract.ts";
import { elapsed, num } from "../../lib/format.ts";

export const isFullSuite = ({ selection }: Pick<RunSummary, "selection">) =>
	!!selection.groups?.includes("all") &&
	!selection.files?.length &&
	!selection.grep;

/** Group names, a file count and the grep, as selected. */
export const scopeLabel = ({ selection }: Pick<RunSummary, "selection">) => {
	const { groups = [], files = [], grep } = selection;
	return (
		[
			...groups,
			files.length
				? `${num(files.length)} file${files.length === 1 ? "" : "s"}`
				: null,
			grep ? `grep "${grep}"` : null,
		]
			.filter(Boolean)
			.join(" · ") || "—"
	);
};

export type RunResult = "passed" | "failed" | "cancelled";

export const runResult = ({ status }: Pick<RunSummary, "status">): RunResult =>
	status === "passed"
		? "passed"
		: status === "cancelled"
			? "cancelled"
			: "failed";

export const RESULT_BG: Record<RunResult, string> = {
	passed: "bg-green-500",
	failed: "bg-red-500",
	cancelled: "bg-subtle/45",
};

export const runDuration = (run: RunSummary, now: number) =>
	elapsed({ from: run.startedAt ?? run.createdAt, to: run.finishedAt, now });

export const passRate = (run: RunSummary) =>
	run.fileCount ? (run.passed / run.fileCount) * 100 : null;

/** "Today", "Yesterday", else "Oct 4", by the viewer's local calendar day. */
export const dayLabel = (iso: string, now: number) => {
	const day = (ms: number) => new Date(ms).toDateString();
	const at = Date.parse(iso);
	if (day(at) === day(now)) return "Today";
	if (day(at) === day(now - 86_400_000)) return "Yesterday";
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
	}).format(at);
};

/** Local midnight as ISO, the start of "Today". */
export const startOfToday = (now: number) => {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.toISOString();
};

/** Compact age: "now", "12m", "3h", "4d". */
export const age = (iso: string, now: number) => {
	const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
	return `${Math.floor(minutes / (24 * 60))}d`;
};
