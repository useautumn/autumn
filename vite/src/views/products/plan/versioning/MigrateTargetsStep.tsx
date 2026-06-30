import type {
	PlanUpdatePreview,
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
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

function MetaBadge({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-tertiary-foreground tabular-nums">
			{children}
		</span>
	);
}

function VersionStatusBadges({
	row,
	showCustomers,
}: {
	row: MigrateTargetRow;
	showCustomers: boolean;
}) {
	let status = "";
	if (row.isNew) status = "New";
	else if (row.isCurrent) status = "Current";
	return (
		<div className="flex shrink-0 items-center gap-1.5">
			<MetaBadge>v{row.version}</MetaBadge>
			{status && <MetaBadge>{status}</MetaBadge>}
			{showCustomers && row.customerCount > 0 && (
				<span className="flex items-center gap-1 text-[11px] text-tertiary-foreground">
					<UsersIcon size={11} />
					{row.customerCount}
				</span>
			)}
			{row.conflicts.length > 0 && (
				<span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
					<WarningIcon size={11} weight="fill" />
					{row.conflicts.length}
				</span>
			)}
		</div>
	);
}

function VersionBody({ row }: { row: MigrateTargetRow }) {
	const hasChanges = row.itemChanges.length > 0 || row.hasPriceChange;
	return (
		<div className="flex flex-col gap-1.5">
			{row.itemChanges.length > 0 && (
				<ItemChangeList itemChanges={row.itemChanges} />
			)}
			{row.hasPriceChange && (
				<span className="text-tertiary-foreground text-xs">
					Base price change
				</span>
			)}
			{row.settingChanges.map((change) => (
				<div className="flex items-center gap-1.5 text-xs" key={change.key}>
					<span className="font-medium text-foreground">{change.label}</span>
					<span className="text-muted-foreground">{change.detail}</span>
				</div>
			))}
			{!hasChanges && (
				<span className="text-tertiary-foreground/70 text-xs italic">
					No changes
				</span>
			)}
			{row.conflicts.map((conflict, index) => (
				<span
					className="text-amber-600 text-xs dark:text-amber-500"
					key={`${conflict.reason}-${index}`}
				>
					{conflictSentence(conflict)}
				</span>
			))}
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
			<p className="text-sm text-tertiary-foreground">No changes to apply.</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{targets.map((target) => {
				const singleRow = target.rows.length === 1;
				return (
					<div
						className="flex flex-col gap-2.5 rounded-xl bg-secondary/40 px-3 py-2.5"
						key={target.id}
					>
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-sm font-medium text-foreground">
								{target.name}
							</span>
							<div className="flex shrink-0 items-center gap-1.5">
								{singleRow && (
									<VersionStatusBadges
										row={target.rows[0]}
										showCustomers={showCustomers}
									/>
								)}
								{target.isBase && <MetaBadge>Base</MetaBadge>}
							</div>
						</div>
						{singleRow ? (
							<VersionBody row={target.rows[0]} />
						) : (
							<div className="flex flex-col gap-2">
								{target.rows.map((row) => (
									<div className="flex flex-col gap-1.5" key={row.version}>
										<VersionStatusBadges
											row={row}
											showCustomers={showCustomers}
										/>
										<VersionBody row={row} />
									</div>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
