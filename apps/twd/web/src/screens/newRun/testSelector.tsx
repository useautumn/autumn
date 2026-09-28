import { ChevronRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import type { Catalog } from "../../../../src/api/contract.ts";
import { Checkbox, Kbd, SearchInput } from "../../components/ui.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";
import { fuzzyMatch } from "./estimate.ts";
import { buildGroupTree } from "./groupTree.ts";
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
							? "text-foreground underline decoration-blue-500/60 underline-offset-2"
							: i < dir
								? "text-tertiary-foreground"
								: "text-foreground",
					)}
				>
					{ch}
				</span>
			))}
		</span>
	);
};

/** Drag-to-select: press on a row sets the target state, entering other rows applies it. */
let paintTarget: boolean | null = null;
if (typeof window !== "undefined")
	window.addEventListener("pointerup", () => {
		paintTarget = null;
	});

const FileRow = ({
	path,
	indexes,
	checked,
	p90,
	onToggle,
	indent = 0,
}: {
	path: string;
	indexes?: number[];
	checked: boolean;
	p90: number | null;
	onToggle: (on: boolean) => void;
	indent?: number;
}) => (
	<div
		role="checkbox"
		aria-checked={checked}
		aria-label={path}
		tabIndex={0}
		onPointerDown={(e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			paintTarget = !checked;
			onToggle(!checked);
		}}
		onPointerEnter={() => {
			if (paintTarget !== null && paintTarget !== checked)
				onToggle(paintTarget);
		}}
		onKeyDown={(e) => {
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				onToggle(!checked);
			}
		}}
		style={{ paddingLeft: `${0.75 + indent * 1.75}rem` }}
		className="flex h-7 cursor-pointer select-none items-center gap-2.5 pr-3 text-tiny-id hover:bg-interactive-secondary-hover"
	>
		<span className="pointer-events-none flex">
			<Checkbox checked={checked} onCheckedChange={() => {}} label={path} />
		</span>
		{indexes ? (
			<Highlight text={path} indexes={indexes} />
		) : (
			<span className="truncate">
				<span className="text-tertiary-foreground">
					{path.slice(0, path.lastIndexOf("/") + 1)}
				</span>
				{path.slice(path.lastIndexOf("/") + 1)}
			</span>
		)}
		<span className="ml-auto shrink-0 pl-3 font-sans text-[11px] text-subtle tabular-nums">
			{p90 === null ? "new" : `p90 ${formatMs(p90)}`}
		</span>
	</div>
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
	const tree = useMemo(() => buildGroupTree(catalog), [catalog]);

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

	const renderGroup = (
		{ name, description, fileCount }: Catalog["groups"][number],
		depth = 0,
		nested = true,
	) => {
		const state = sel.groupState(name);
		const expanded = open.has(name);
		const picked = sel
			.filesOf(name)
			.filter((f) => sel.selectedSet.has(f)).length;
		return (
			<div key={name}>
				<div
					style={{ paddingLeft: `${0.75 + depth * 1.75}rem` }}
					className="group flex h-8 items-center gap-2.5 pr-3 hover:bg-interactive-secondary-hover"
				>
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
								"size-3.5 shrink-0 text-subtle transition-transform duration-150",
								expanded && "rotate-90",
							)}
						/>
						<span className="shrink-0 text-tiny-id text-foreground">
							{name}
						</span>
						<span className="truncate text-xs text-tertiary-foreground">
							{description}
						</span>
					</button>
					<span className="shrink-0 text-xs text-subtle tabular-nums">
						{picked > 0 && state !== "checked" ? (
							<span className="text-foreground">{picked} / </span>
						) : null}
						{num(fileCount)}
					</span>
				</div>
				{expanded && (
					<div className={cn(depth === 0 && "border-y bg-background py-1")}>
						{nested &&
							tree.children
								.get(name)
								?.map((child) => renderGroup(child, depth + 1))}
						{(nested
							? (tree.looseFiles.get(name) ?? [])
							: sel.filesOf(name)
						).map((path) => (
							<FileRow
								key={path}
								path={path}
								indent={depth + 1}
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
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="relative border-b p-2">
				<SearchInput
					value={query}
					onChange={setQuery}
					onKeyDown={(e) => e.key === "Escape" && setQuery("")}
					placeholder={`Fuzzy search ${num(catalog.files.length)} files and ${catalog.groups.length} groups`}
				/>
				{query ? (
					<span className="absolute top-1/2 right-4 -translate-y-1/2">
						<Kbd>esc</Kbd>
					</span>
				) : (
					<button
						type="button"
						className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer rounded px-1.5 text-xs text-primary hover:bg-muted"
						onClick={() => sel.addFiles(catalog.files.map((f) => f.path))}
					>
						Select all {num(catalog.files.length)}
					</button>
				)}
			</div>
			<div className="max-h-[70dvh] min-h-80 overflow-auto lg:max-h-none lg:min-h-0 lg:flex-1">
				{deferred ? (
					<>
						{groupHits.length > 0 && (
							<div className="border-b border-border pb-1">
								<p className="px-3 pt-2 pb-1 text-[11px] font-medium text-subtle">
									Groups
								</p>
								{groupHits.map((g) => renderGroup(g, 0, false))}
							</div>
						)}
						<p className="flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-medium text-subtle">
							<span className="flex items-center gap-2">
								Files
								{results.length > 0 && (
									<button
										type="button"
										className="cursor-pointer rounded px-1 text-primary hover:bg-muted"
										onClick={() => {
											const paths = results.map((r) => r.file.path);
											const allOn = paths.every((p) => sel.selectedSet.has(p));
											if (!allOn) return sel.addFiles(paths);
											for (const r of results) sel.toggleFile(r.file, false);
										}}
									>
										{results.every((r) => sel.selectedSet.has(r.file.path))
											? "Deselect all"
											: `Select all ${num(results.length)}`}
									</button>
								)}
							</span>
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
							<p className="px-3 py-8 text-center text-xs text-tertiary-foreground">
								No file path matches “{deferred}”.
							</p>
						)}
					</>
				) : (
					TIERS.map(({ tier, label }) => {
						const groups = tree.roots.filter((g) => g.tier === tier);
						if (!groups.length) return null;
						return (
							<div
								key={tier}
								className="border-b border-border pb-1 last:border-b-0"
							>
								<p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-subtle">
									{label}
								</p>
								{groups.map((g) => renderGroup(g))}
							</div>
						);
					})
				)}
			</div>
		</div>
	);
};
