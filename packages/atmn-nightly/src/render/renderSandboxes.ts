import chalk from "chalk";
import type { ListSandboxesResponse } from "../generated/client";

/**
 * Headless rendering, like the preview: a table a terminal or a CI log can
 * read. Nothing here decides anything — it reports what `sandboxes.list` said.
 */

export type SandboxRow = ListSandboxesResponse["list"][number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export const NO_SANDBOXES =
	"No sandboxes yet. Create one with atmn sandbox create <name>.";

const HEADERS = ["ID", "NAME", "CREATED"] as const;
const GAP = "  ";
const CURRENT_MARKER = "← current";

/** How old, in the terms a reader thinks in; `--json` carries the exact stamp. */
export const relativeAge = ({
	createdAt,
	now,
}: {
	createdAt: number;
	now: number;
}): string => {
	const elapsed = Math.max(0, now - createdAt);
	if (elapsed < MINUTE) return "just now";
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
	if (elapsed < MONTH) return `${Math.floor(elapsed / DAY)}d ago`;
	if (elapsed < YEAR) return `${Math.floor(elapsed / MONTH)}mo ago`;
	return `${Math.floor(elapsed / YEAR)}y ago`;
};

const columnWidths = ({ rows }: { rows: string[][] }): number[] =>
	HEADERS.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
	);

const tableLine = ({
	cells,
	widths,
	marker,
}: {
	cells: readonly string[];
	widths: number[];
	marker: string;
}): string =>
	`${cells
		.map((cell, column) => cell.padEnd(widths[column] ?? 0))
		.join(GAP)}${marker}`.trimEnd();

export const renderSandboxes = ({
	sandboxes,
	currentSandboxId,
	now = Date.now(),
}: {
	sandboxes: SandboxRow[];
	/** The sandbox `--sandbox` or AUTUMN_SANDBOX_ID points at, if any. */
	currentSandboxId?: string;
	now?: number;
}): string => {
	if (sandboxes.length === 0) return chalk.dim(NO_SANDBOXES);

	const rows = sandboxes.map((sandbox) => [
		sandbox.id,
		sandbox.name,
		relativeAge({ createdAt: sandbox.createdAt, now }),
	]);
	const widths = columnWidths({ rows });

	return [
		chalk.dim(tableLine({ cells: HEADERS, widths, marker: "" })),
		...rows.map((cells, index) =>
			tableLine({
				cells,
				widths,
				marker:
					sandboxes[index]?.id === currentSandboxId
						? chalk.dim(`${GAP}${CURRENT_MARKER}`)
						: "",
			}),
		),
	].join("\n");
};
