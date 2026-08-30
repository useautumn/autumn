import type { Feature } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon, WarningIcon } from "@phosphor-icons/react";
import { PlanVersionScopeItems } from "@/components/plans/PlanVersionScopeItems";
import {
	planScopeIsWholePlan,
	planScopeLabel,
	planScopePinnedVersions,
	toggleWholePlan,
} from "@/components/plans/planScopeSelection";
import {
	type LicenseParentTarget,
	licenseParentVersionsInScope,
	mergeCatalogPlanChangeDiffs,
} from "../catalog/catalogPlanPreview";
import { PropagationConflictWarning } from "./PropagationConflictWarning";
import { PropagationTargetRow } from "./PropagationTargetRow";

/**
 * Parent plans are picked per plan, then scoped to all versions or a specific
 * set — the only lane where the target carries its own versioning.
 */
export function LicenseParentTargetsStep({
	features,
	targets,
	selectedKeys,
	onChange,
}: {
	features?: Feature[];
	targets: LicenseParentTarget[];
	selectedKeys: string[];
	onChange: (next: string[]) => void;
}) {
	if (targets.length === 0) return null;

	const hasConflicts = targets.some((target) =>
		target.versions.some((entry) => entry.conflicts.length > 0),
	);

	return (
		<div className="flex flex-col gap-2">
			<PropagationConflictWarning hasConflicts={hasConflicts} />
			<div className="flex flex-col gap-2">
				{targets.map((target) => (
					<LicenseParentRow
						features={features}
						key={target.planId}
						onChange={onChange}
						selectedKeys={selectedKeys}
						target={target}
					/>
				))}
			</div>
		</div>
	);
}

function LicenseParentRow({
	target,
	selectedKeys,
	onChange,
	features,
}: {
	target: LicenseParentTarget;
	selectedKeys: string[];
	onChange: (next: string[]) => void;
	features?: Feature[];
}) {
	const { planId, name, versions } = target;
	const inScope = licenseParentVersionsInScope({ target, selectedKeys });
	// An unselected parent still explains itself with its own versions' diffs.
	const described = inScope.length > 0 ? inScope : versions;

	return (
		<PropagationTargetRow
			checked={planScopeIsWholePlan({ selectedKeys, planId })}
			conflicts={described.flatMap((entry) => entry.conflicts)}
			detail={planId}
			diff={mergeCatalogPlanChangeDiffs(described)}
			features={features}
			indeterminate={
				planScopePinnedVersions({ selectedKeys, planId }).length > 0
			}
			name={name}
			onToggle={() => onChange(toggleWholePlan({ selectedKeys, planId }))}
			trailing={
				<LicenseParentScopeControl
					onChange={onChange}
					planId={planId}
					selectedKeys={selectedKeys}
					versions={versions}
				/>
			}
		/>
	);
}

function LicenseParentScopeControl({
	planId,
	versions,
	selectedKeys,
	onChange,
}: {
	planId: string;
	versions: LicenseParentTarget["versions"];
	selectedKeys: string[];
	onChange: (next: string[]) => void;
}) {
	if (versions.length <= 1) {
		const only = versions[0];
		return (
			<span className="shrink-0 font-mono text-tertiary-foreground text-xs">
				{only?.versionSlug ?? `v${only?.version ?? 1}`}
			</span>
		);
	}

	const conflictingVersions = new Set(
		versions
			.filter((entry) => entry.conflicts.length > 0)
			.map((entry) => entry.version),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-tertiary-foreground text-xs transition-colors hover:bg-secondary hover:text-foreground">
				{planScopeLabel({ selectedKeys, planId })}
				<CaretDownIcon size={10} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<PlanVersionScopeItems
					onChange={onChange}
					planId={planId}
					renderVersionSuffix={(version) =>
						conflictingVersions.has(version) ? (
							<WarningIcon
								className="text-amber-600 dark:text-amber-500"
								size={11}
								weight="fill"
							/>
						) : null
					}
					selectedKeys={selectedKeys}
					versionLabel={(version) =>
						versions.find((entry) => entry.version === version)?.versionSlug ??
						`v${version}`
					}
					versions={versions.map((entry) => entry.version)}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
