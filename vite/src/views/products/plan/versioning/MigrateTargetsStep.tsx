import type {
	PlanUpdatePreview,
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
import { Badge } from "@autumn/ui";
import { UsersIcon, WarningIcon } from "@phosphor-icons/react";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import {
	previousAttributesToSettingChanges,
	type SettingChange,
} from "./PlanSettingsChanges";
import { conflictSentence } from "./variantConflicts";

export type MigrateTargetRow = {
	version: number;
	isCurrent: boolean;
	isNew: boolean;
	itemChanges: PlanUpdatePreviewItemChange[];
	hasPriceChange: boolean;
	settingChanges: SettingChange[];
	customerCount: number;
	conflicts: PlanUpdatePreviewVariantConflict[];
};

export type MigrateTarget = {
	id: string;
	name: string;
	isBase: boolean;
	rows: MigrateTargetRow[];
};

export function buildMigrateTargets({
	preview,
	selectedVariantIds,
	versionChoice,
	currentVersion,
	baseName,
}: {
	preview: PlanUpdatePreview;
	selectedVariantIds: string[];
	versionChoice: "new" | "update" | "all";
	currentVersion: number;
	baseName: string;
}): MigrateTarget[] {
	const includeHistorical = versionChoice === "all";
	const isNewVersion = versionChoice === "new";
	// New-version only bumps plans that have customers to grandfather;
	// customer-less plans are updated in place and stay current.
	const baseCreatesNewVersion = isNewVersion && preview.has_customers;

	const baseRows: MigrateTargetRow[] = [
		{
			version: baseCreatesNewVersion ? currentVersion + 1 : currentVersion,
			isCurrent: !baseCreatesNewVersion,
			isNew: baseCreatesNewVersion,
			itemChanges: preview.item_changes ?? [],
			hasPriceChange: preview.price_change !== undefined,
			settingChanges: previousAttributesToSettingChanges(
				preview.previous_attributes,
			),
			customerCount: preview.customer_count,
			conflicts: [],
		},
		...(includeHistorical
			? (preview.other_versions ?? []).map((version) => ({
					version: version.version,
					isCurrent: false,
					isNew: false,
					itemChanges: version.item_changes ?? [],
					hasPriceChange: version.price_change !== undefined,
					settingChanges: previousAttributesToSettingChanges(
						version.previous_attributes,
					),
					customerCount: version.customer_count,
					conflicts: version.conflicts,
				}))
			: []),
	];

	const targets: MigrateTarget[] = [
		{ id: preview.plan_id, name: baseName, isBase: true, rows: baseRows },
	];

	// Variant history lives as separate entries in preview.variants (one per
	// version), not nested under other_versions, so group by plan_id.
	for (const variantId of selectedVariantIds) {
		const entries = preview.variants
			.filter((variant) => variant.plan_id === variantId)
			.sort((a, b) => b.version - a.version);
		if (entries.length === 0) continue;

		const latestVersion = entries[0].version;
		const visible = includeHistorical
			? entries
			: entries.filter((entry) => entry.version === latestVersion);

		targets.push({
			id: variantId,
			name: entries[0].name,
			isBase: false,
			rows: visible.map((entry) => {
				const isLatest = entry.version === latestVersion;
				// New-version only bumps variants that have customers to grandfather;
				// customer-less variants are updated in place and stay current.
				const createsNewVersion =
					isNewVersion && isLatest && entry.has_customers;
				return {
					version: createsNewVersion ? entry.version + 1 : entry.version,
					isCurrent: isLatest && !createsNewVersion,
					isNew: createsNewVersion,
					itemChanges: entry.item_changes ?? [],
					hasPriceChange: entry.price_change !== undefined,
					settingChanges: previousAttributesToSettingChanges(
						entry.previous_attributes,
					),
					customerCount: entry.customer_count,
					conflicts: entry.conflicts,
				};
			}),
		});
	}

	return targets;
}

function CustomerBadge({ count }: { count: number }) {
	if (count <= 0) return null;
	return (
		<Badge
			className="gap-1 text-[11px] text-muted-foreground"
			variant="secondary"
		>
			<UsersIcon size={11} />
			{count} customer{count === 1 ? "" : "s"}
		</Badge>
	);
}

function VersionRow({
	row,
	showCustomers,
}: {
	row: MigrateTargetRow;
	showCustomers: boolean;
}) {
	const hasChanges =
		row.itemChanges.length > 0 ||
		row.hasPriceChange ||
		row.settingChanges.length > 0;
	let versionSuffix = "";
	if (row.isNew) versionSuffix = " · new";
	else if (row.isCurrent) versionSuffix = " · current";
	return (
		<div className="flex flex-col gap-1.5 rounded-md bg-muted/40 px-2.5 py-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-xs font-medium text-foreground">
					v{row.version}
					{versionSuffix}
				</span>
				{showCustomers && <CustomerBadge count={row.customerCount} />}
				{row.conflicts.length > 0 && (
					<Badge
						className="gap-1 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-500"
						variant="secondary"
					>
						<WarningIcon size={11} weight="fill" />
						{row.conflicts.length} conflict
						{row.conflicts.length === 1 ? "" : "s"}
					</Badge>
				)}
			</div>
			{row.itemChanges.length > 0 && (
				<ItemChangeList itemChanges={row.itemChanges} />
			)}
			{row.hasPriceChange && (
				<span className="text-xs text-muted-foreground">Base price change</span>
			)}
			{row.settingChanges.map((change) => (
				<div className="flex items-center gap-1.5 text-xs" key={change.key}>
					<span className="font-medium text-foreground">{change.label}</span>
					<span className="text-muted-foreground">{change.detail}</span>
				</div>
			))}
			{!hasChanges && (
				<span className="text-xs text-muted-foreground/70 italic">
					No changes
				</span>
			)}
			{row.conflicts.length > 0 && (
				<div className="flex flex-col gap-0.5">
					{row.conflicts.map((conflict, index) => (
						<span
							className="text-amber-600 text-xs dark:text-amber-500"
							key={`${conflict.reason}-${index}`}
						>
							{conflictSentence(conflict)}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

export function MigrateTargetsStep({
	targets,
	showCustomers = true,
}: {
	targets: MigrateTarget[];
	showCustomers?: boolean;
}) {
	if (targets.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">No changes to apply.</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{targets.map((target) => (
				<div
					className="flex flex-col gap-2 rounded-lg border border-border p-3"
					key={target.id}
				>
					<div className="flex items-center justify-between gap-2">
						<span className="text-sm font-medium text-foreground">
							{target.name}
						</span>
						{target.isBase && (
							<Badge
								className="text-[11px] text-muted-foreground"
								variant="secondary"
							>
								Base
							</Badge>
						)}
					</div>
					<div className="flex flex-col gap-2">
						{target.rows.map((row) => (
							<VersionRow
								key={row.version}
								row={row}
								showCustomers={showCustomers}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
