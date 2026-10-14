import type { Feature } from "@autumn/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	type ImportPreviewFilter,
	type ImportPreviewKind,
	type ImportPreviewRow as ImportPreviewRowModel,
	matchesImportPreviewFilter,
} from "../../utils/importPreviewRows";
import { ImportPreviewRow } from "./ImportPreviewRow";

const KIND_LABELS: Record<ImportPreviewKind, string> = {
	plans: "Plans",
	features: "Features",
	rewards: "Rewards",
};

const KIND_ORDER: ImportPreviewKind[] = ["plans", "features", "rewards"];

function FilterChip({
	label,
	count,
	active,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex h-6 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs",
				active
					? "border-border bg-overlay-hover text-foreground"
					: "border-border/60 text-muted-foreground hover:bg-overlay-hover",
			)}
		>
			{label}
			<span className="text-tertiary-foreground">{count}</span>
		</button>
	);
}

function PreviewGroup({
	kind,
	rows,
	features,
	expanded,
	onToggleRow,
}: {
	kind: ImportPreviewKind;
	rows: ImportPreviewRowModel[];
	features: Feature[];
	expanded: ReadonlySet<string>;
	onToggleRow: (key: string) => void;
}) {
	const [showUnchanged, setShowUnchanged] = useState(false);
	const changed = rows.filter((row) => row.changed);
	const unchanged = rows.filter((row) => !row.changed);
	const visible = showUnchanged ? rows : changed;
	if (rows.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2 text-xs">
				<span className="text-foreground">{KIND_LABELS[kind]}</span>
				<span className="text-tertiary-foreground">
					{changed.length} changed · {unchanged.length} unchanged
				</span>
				{unchanged.length > 0 && (
					<button
						type="button"
						onClick={() => setShowUnchanged((current) => !current)}
						className="ml-auto cursor-pointer text-tertiary-foreground hover:text-foreground"
					>
						{showUnchanged ? "Hide" : "Show"} {unchanged.length} unchanged
					</button>
				)}
			</div>
			{visible.length > 0 && (
				<div className="overflow-hidden rounded-lg border border-border">
					{visible.map((row) => (
						<ImportPreviewRow
							expanded={expanded.has(row.key)}
							features={features}
							key={row.key}
							onToggle={() => onToggleRow(row.key)}
							row={row}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function ImportPreviewList({
	rows,
	features,
}: {
	rows: ImportPreviewRowModel[];
	features: Feature[];
}) {
	const [filter, setFilter] = useState<ImportPreviewFilter>({
		action: "all",
		kind: "all",
	});
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

	const changedRows = rows.filter((row) => row.changed);
	const countOf = (partial: Partial<ImportPreviewFilter>) =>
		changedRows.filter((row) =>
			matchesImportPreviewFilter({
				row,
				filter: { action: "all", kind: "all", ...partial },
			}),
		).length;
	const kinds = KIND_ORDER.filter((kind) =>
		rows.some((row) => row.kind === kind),
	);
	const filtered = rows.filter((row) =>
		matchesImportPreviewFilter({ row, filter }),
	);
	const hiddenCount = rows.length - changedRows.length;

	const toggleRow = (key: string) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	if (changedRows.length === 0 && rows.length > 0) {
		return (
			<div className="flex flex-1 items-center justify-center rounded-lg border border-border border-dashed text-tertiary-foreground text-sm">
				No changes: this org already matches the JSON.
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<FilterChip
					label="All"
					count={changedRows.length}
					active={filter.action === "all" && filter.kind === "all"}
					onClick={() => setFilter({ action: "all", kind: "all" })}
				/>
				{(["create", "update"] as const).map((action) => (
					<FilterChip
						key={action}
						label={action === "create" ? "Create" : "Update"}
						count={countOf({ action })}
						active={filter.action === action}
						onClick={() =>
							setFilter((current) => ({
								...current,
								action: current.action === action ? "all" : action,
							}))
						}
					/>
				))}
				<span className="mx-1 h-4 w-px bg-border" />
				{kinds.map((kind) => (
					<FilterChip
						key={kind}
						label={KIND_LABELS[kind]}
						count={countOf({ kind })}
						active={filter.kind === kind}
						onClick={() =>
							setFilter((current) => ({
								...current,
								kind: current.kind === kind ? "all" : kind,
							}))
						}
					/>
				))}
				<span className="ml-auto text-tertiary-foreground text-xs">
					{hiddenCount} unchanged hidden
				</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
				{kinds.map((kind) => (
					<PreviewGroup
						expanded={expanded}
						features={features}
						key={kind}
						kind={kind}
						onToggleRow={toggleRow}
						rows={filtered.filter((row) => row.kind === kind)}
					/>
				))}
			</div>
		</div>
	);
}
