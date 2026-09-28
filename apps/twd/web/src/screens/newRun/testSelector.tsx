import { ChevronRight, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { Catalog } from "../../../../src/api/contract.ts";
import { Checkbox, Input, Kbd } from "../../components/ui.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";
import { fuzzyMatch } from "./estimate.ts";
import type { RunSelectionState } from "./useRunSelection.ts";

const TIERS = [
	{ tier: "suite", label: "Suites" },
	{ tier: "core", label: "Core" },
	{ tier: "domain", label: "Domains" },
] as const;

const MAX_RESULTS = 80;

const Highlight = ({ text, indexes }: { text: string; indexes: number[] }) => {
	const hit = new Set(indexes);
	const dir = text.lastIndexOf("/") + 1;
	return (
		<span className="truncate">
			{[...text].map((ch, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: characters of a fixed string
					key={i}
					className={cn(
						hit.has(i)
							? "text-fg underline decoration-info/60 underline-offset-2"
							: i < dir
								? "text-muted"
								: "text-fg",
					)}
				>
					{ch}
				</span>
			))}
		</span>
	);
};

const FileRow = ({
	path,
	indexes,
	checked,
	p90,
	onToggle,
	indent,
}: {
	path: string;
	indexes?: number[];
	checked: boolean;
	p90: number | null;
	onToggle: (on: boolean) => void;
	indent?: boolean;
}) => (
	// biome-ignore lint/a11y/noLabelWithoutControl: Base UI Checkbox renders the native input inside
	<label
		className={cn(
			"flex h-7 cursor-pointer items-center gap-2.5 pr-3 font-mono text-[12px] hover:bg-hover",
			indent ? "pl-10" : "pl-3",
		)}
	>
		<Checkbox checked={checked} onCheckedChange={onToggle} label={path} />
		{indexes ? (
			<Highlight text={path} indexes={indexes} />
		) : (
			<span className="truncate">
				<span className="text-muted">
					{path.slice(0, path.lastIndexOf("/") + 1)}
				</span>
				{path.slice(path.lastIndexOf("/") + 1)}
			</span>
		)}
		<span className="ml-auto shrink-0 pl-3 font-sans text-[11px] text-faint tabular-nums">
			{p90 === null ? "new" : `p90 ${formatMs(p90)}`}
		</span>
	</label>
);

export const TestSelector = ({
	catalog,
	sel,
}: {
	catalog: Catalog;
	sel: RunSelectionState;
}) => {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<Set<string>>(new Set());
	const deferred = useDeferredValue(query.trim());
	const byPath = new Map(catalog.files.map((f) => [f.path, f]));

	const results = deferred
		? catalog.files
				.flatMap((f) => {
					const m = fuzzyMatch(deferred, f.path);
					return m ? [{ file: f, ...m }] : [];
				})
				.sort((a, b) => b.score - a.score)
		: [];
	const groupHits = deferred
		? catalog.groups.filter((g) => fuzzyMatch(deferred, g.name))
		: [];

	const toggleOpen = (name: string) =>
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});

	const renderGroup = ({
		name,
		description,
		fileCount,
	}: Catalog["groups"][number]) => {
		const state = sel.groupState(name);
		const expanded = open.has(name);
		const picked = sel
			.filesOf(name)
			.filter((f) => sel.selectedSet.has(f)).length;
		return (
			<div key={name}>
				<div className="group flex h-9 items-center gap-2.5 pr-3 pl-3 hover:bg-hover">
					<Checkbox
						checked={state === "checked"}
						indeterminate={state === "partial"}
						onCheckedChange={(on) => sel.toggleGroup(name, on)}
						label={`Select ${name}`}
					/>
					<button
						type="button"
						onClick={() => toggleOpen(name)}
						aria-expanded={expanded}
						className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none"
					>
						<ChevronRight
							className={cn(
								"size-3.5 shrink-0 text-faint transition-transform duration-150",
								expanded && "rotate-90",
							)}
						/>
						<span className="shrink-0 font-mono text-[12.5px] font-medium">
							{name}
						</span>
						<span className="truncate text-xs text-muted">{description}</span>
					</button>
					<span className="shrink-0 text-xs text-faint tabular-nums">
						{picked > 0 && state !== "checked" ? (
							<span className="text-fg">{picked} / </span>
						) : null}
						{num(fileCount)}
					</span>
				</div>
				{expanded && (
					<div className="border-y border-line bg-bg/60 py-1">
						{sel.filesOf(name).map((path) => (
							<FileRow
								key={path}
								path={path}
								indent
								checked={sel.selectedSet.has(path)}
								p90={byPath.get(path)?.baselineP90Ms ?? null}
								onToggle={(on) => {
									const f = byPath.get(path);
									if (f) sel.toggleFile(f, on);
								}}
							/>
						))}
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="flex min-h-0 flex-col">
			<div className="relative border-b border-line p-2">
				<Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-faint" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => e.key === "Escape" && setQuery("")}
					placeholder={`Fuzzy search ${num(catalog.files.length)} files and ${catalog.groups.length} groups`}
					aria-label="Search tests"
					className="border-transparent bg-transparent pl-8 focus:border-transparent focus-visible:ring-0"
				/>
				{query && (
					<span className="absolute top-1/2 right-4 -translate-y-1/2">
						<Kbd>esc</Kbd>
					</span>
				)}
			</div>
			<div className="max-h-[calc(100dvh-19rem)] min-h-80 overflow-auto">
				{deferred ? (
					<>
						{groupHits.length > 0 && (
							<div className="border-b border-line pb-1">
								<p className="px-3 pt-2 pb-1 text-[11px] font-medium text-faint">
									Groups
								</p>
								{groupHits.map(renderGroup)}
							</div>
						)}
						<p className="flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-medium text-faint">
							<span>Files</span>
							<span className="tabular-nums">
								{results.length > MAX_RESULTS
									? `top ${MAX_RESULTS} of ${num(results.length)}`
									: num(results.length)}
							</span>
						</p>
						{results.slice(0, MAX_RESULTS).map((r) => (
							<FileRow
								key={r.file.path}
								path={r.file.path}
								indexes={r.indexes}
								checked={sel.selectedSet.has(r.file.path)}
								p90={r.file.baselineP90Ms}
								onToggle={(on) => sel.toggleFile(r.file, on)}
							/>
						))}
						{results.length === 0 && (
							<p className="px-3 py-8 text-center text-xs text-muted">
								No file path matches “{deferred}”.
							</p>
						)}
					</>
				) : (
					TIERS.map(({ tier, label }) => {
						const groups = catalog.groups.filter((g) => g.tier === tier);
						if (!groups.length) return null;
						return (
							<div
								key={tier}
								className="border-b border-line pb-1 last:border-b-0"
							>
								<p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-faint">
									{label}
								</p>
								{groups.map(renderGroup)}
							</div>
						);
					})
				)}
			</div>
		</div>
	);
};
