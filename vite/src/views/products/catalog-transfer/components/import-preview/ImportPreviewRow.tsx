import type {
	CatalogVariantPreview,
	Feature,
	PlanChangeV0,
} from "@autumn/shared";
import { StatusChip } from "@autumn/ui";
import { CaretRightIcon, GitForkIcon, UsersIcon } from "@phosphor-icons/react";
import { PlanDiffBody } from "@/components/v2/PlanDiffBody";
import { cn } from "@/lib/utils";
import { LicenseChangeList } from "@/views/products/plan/versioning/LicenseChangeList";
import type { ImportPreviewRow as ImportPreviewRowModel } from "../../utils/importPreviewRows";

const ACTION_LABELS: Record<ImportPreviewRowModel["action"], string> = {
	create: "Create",
	update: "Update",
	delete: "Remove",
	skip: "Skipped",
	none: "No changes",
};

const ACTION_TONES: Record<ImportPreviewRowModel["action"], string> = {
	create: "text-green-600 dark:text-green-500",
	update: "text-green-600 dark:text-green-500",
	delete: "text-red-600 dark:text-red-500",
	skip: "text-amber-600 dark:text-amber-500",
	none: "text-tertiary-foreground",
};

const VARIANT_ACTION_LABELS = {
	explicit: "Direct",
	propagated: "Propagated",
	unchanged: "Unchanged",
} as const;

const valueText = (value: unknown) =>
	value === null || value === undefined
		? "none"
		: typeof value === "object"
			? JSON.stringify(value)
			: String(value);

function PreviousAttributes({
	previous,
}: {
	previous: Record<string, unknown> | null | undefined;
}) {
	const entries = Object.entries(previous ?? {});
	if (entries.length === 0)
		return (
			<span className="text-tertiary-foreground/70 text-xs italic">
				No field changes
			</span>
		);
	return (
		<div className="flex flex-col gap-1">
			{entries.map(([key, value]) => (
				<div className="flex items-center gap-1.5 text-xs" key={key}>
					<span className="font-medium text-foreground">{key}</span>
					<span className="text-tertiary-foreground">was</span>
					<span className="truncate font-mono text-tertiary-foreground">
						{valueText(value)}
					</span>
				</div>
			))}
		</div>
	);
}

function PlanChangeBody({
	features,
	planChange,
}: {
	features: Feature[];
	planChange: PlanChangeV0 | null | undefined;
}) {
	return (
		<div className="flex flex-col gap-2">
			<PlanDiffBody features={features} plan={planChange ?? {}} />
			<LicenseChangeList
				changes={planChange?.license_changes ?? []}
				features={features}
			/>
		</div>
	);
}

function VariantPreview({
	features,
	variant,
}: {
	features: Feature[];
	variant: CatalogVariantPreview;
}) {
	const customers = variant.state.usage?.customers?.count ?? 0;
	return (
		<div className="flex flex-col gap-1.5 rounded-md bg-secondary/40 px-2.5 py-2">
			<div className="flex items-center gap-2">
				<GitForkIcon className="size-3.5 text-tertiary-foreground" />
				<span className="min-w-0 flex-1 truncate text-foreground text-xs">
					{variant.plan_id}
				</span>
				<StatusChip>{variant.version_slug}</StatusChip>
				{variant.variant_action && (
					<StatusChip>
						{VARIANT_ACTION_LABELS[variant.variant_action]}
					</StatusChip>
				)}
				{customers > 0 && (
					<span className="flex items-center gap-1 text-tertiary-foreground text-xs">
						<UsersIcon size={11} />
						{customers}
					</span>
				)}
			</div>
			<PlanChangeBody features={features} planChange={variant.plan_change} />
		</div>
	);
}

function ExpandedBody({
	features,
	row,
}: {
	features: Feature[];
	row: ImportPreviewRowModel;
}) {
	if (row.plan) {
		const variants = row.plan.variants ?? [];
		return (
			<div className="flex flex-col gap-2.5">
				<PlanChangeBody features={features} planChange={row.plan.plan_change} />
				{variants.length > 0 && (
					<div className="flex flex-col gap-1.5">
						<span className="text-tertiary-foreground text-xs">Variants</span>
						{variants.map((variant) => (
							<VariantPreview
								features={features}
								key={`${variant.plan_id}@${variant.version_slug}`}
								variant={variant}
							/>
						))}
					</div>
				)}
			</div>
		);
	}
	const previous =
		row.feature?.previous_attributes ?? row.reward?.previous_attributes;
	if (row.action === "create")
		return (
			<span className="text-tertiary-foreground text-xs">
				New {row.kind === "features" ? "feature" : "reward"}
			</span>
		);
	return <PreviousAttributes previous={previous} />;
}

export function ImportPreviewRow({
	features,
	row,
	expanded,
	onToggle,
}: {
	features: Feature[];
	row: ImportPreviewRowModel;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="border-border border-b last:border-b-0">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				className="flex h-[34px] w-full cursor-pointer items-center gap-2.5 px-3 text-left hover:bg-overlay-hover"
			>
				<CaretRightIcon
					size={11}
					className={cn(
						"shrink-0 text-tertiary-foreground transition-transform",
						expanded && "rotate-90",
					)}
				/>
				<span
					className={cn("w-[52px] shrink-0 text-xs", ACTION_TONES[row.action])}
				>
					{ACTION_LABELS[row.action]}
				</span>
				<span className="truncate text-foreground text-sm">{row.name}</span>
				<span className="truncate font-mono text-tertiary-foreground text-xs">
					{row.id}
				</span>
				{row.badges.map((badge) => (
					<span
						className="shrink-0 rounded border border-border px-1.5 text-tertiary-foreground text-[11px] leading-[18px]"
						key={badge}
					>
						{badge}
					</span>
				))}
				<span className="ml-auto shrink-0 truncate pl-2 text-tertiary-foreground text-xs">
					{row.summary}
				</span>
			</button>
			{expanded && (
				<div className="pr-3 pb-3 pl-[86px]">
					<ExpandedBody features={features} row={row} />
				</div>
			)}
		</div>
	);
}
