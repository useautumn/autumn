import type { Feature } from "@autumn/shared";
import { UsersIcon, WarningIcon } from "@phosphor-icons/react";
import type {
	CatalogMigrateTarget,
	CatalogMigrateTargetRow,
} from "../catalog/catalogPlanPreview";
import { TargetDiffPreview } from "./TargetDiffPreview";
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
	row: CatalogMigrateTargetRow;
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
	features,
	row,
	showSettings,
}: {
	features?: Feature[];
	row: CatalogMigrateTargetRow;
	showSettings: boolean;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<TargetDiffPreview
				diff={row}
				emptyLabel="No changes"
				features={features}
				showSettings={showSettings}
			/>
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

const ROLE_LABEL = {
	base: "Base",
	variant: "Variant",
	license_parent: "Parent plan",
} as const;

export function MigrateTargetsStep({
	features,
	targets,
	showCustomers = true,
	showSettings = true,
}: {
	features?: Feature[];
	targets: CatalogMigrateTarget[];
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
								<MetaBadge>{ROLE_LABEL[target.role]}</MetaBadge>
							</div>
						</div>
						{singleRow ? (
							<VersionBody
								features={features}
								row={target.rows[0]}
								showSettings={showSettings}
							/>
						) : (
							<div className="flex flex-col gap-2">
								{target.rows.map((row) => (
									<div className="flex flex-col gap-1.5" key={row.version}>
										<VersionStatusBadges
											row={row}
											showCustomers={showCustomers}
										/>
										<VersionBody
											features={features}
											row={row}
											showSettings={showSettings}
										/>
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
