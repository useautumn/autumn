import { UsersIcon, WarningIcon } from "@phosphor-icons/react";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import type { MigrateTarget, MigrateTargetRow } from "./buildMigrateTargets";
import { conflictSentence } from "./variantConflicts";

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

function VersionBody({
	row,
	showSettings,
}: {
	row: MigrateTargetRow;
	showSettings: boolean;
}) {
	// Settings (config, billing controls, …) are a global metadata patch shared by
	// every version, so the mixed-change view surfaces them once above the targets.
	const settingChanges = showSettings ? row.settingChanges : [];
	const hasChanges =
		row.itemChanges.length > 0 ||
		row.hasPriceChange ||
		settingChanges.length > 0;
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
			{settingChanges.map((change) => (
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
	showSettings = true,
}: {
	targets: MigrateTarget[];
	showCustomers?: boolean;
	showSettings?: boolean;
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
							<VersionBody row={target.rows[0]} showSettings={showSettings} />
						) : (
							<div className="flex flex-col gap-2">
								{target.rows.map((row) => (
									<div className="flex flex-col gap-1.5" key={row.version}>
										<VersionStatusBadges
											row={row}
											showCustomers={showCustomers}
										/>
										<VersionBody row={row} showSettings={showSettings} />
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
