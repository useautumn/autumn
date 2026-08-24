import type { Feature } from "@autumn/shared";
import type { PropagationTarget } from "../catalog/catalogPlanPreview";
import { effectiveMintSlug, type MintSlugSelection } from "./mintTargetSlugs";
import { PropagationConflictWarning } from "./PropagationConflictWarning";
import { PropagationTargetRow } from "./PropagationTargetRow";
import { TargetVersionSlugControl } from "./TargetVersionSlugControl";

/**
 * Variants follow the base plan's own versioning strategy, so they get a plain
 * follow/don't-follow checkbox — plus a slug for the row a follow mints.
 */
export function VariantTargetsStep({
	features,
	targets,
	selectedIds,
	slugSelection,
	onToggle,
	onSlugChange,
}: {
	features?: Feature[];
	targets: PropagationTarget[];
	selectedIds: string[];
	slugSelection: MintSlugSelection;
	onToggle: (id: string) => void;
	onSlugChange: (args: { planId: string; slug: string }) => void;
}) {
	if (targets.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<PropagationConflictWarning
				hasConflicts={targets.some((target) => target.conflicts.length > 0)}
			/>
			<div className="flex flex-col gap-2">
				{targets.map((target) => {
					const selected = selectedIds.includes(target.id);
					return (
						<PropagationTargetRow
							checked={selected}
							conflicts={target.conflicts}
							detail={target.detail}
							diff={target}
							features={features}
							key={target.id}
							name={target.name}
							onToggle={() => onToggle(target.id)}
							trailing={
								selected && target.mintsNewVersion ? (
									<TargetVersionSlugControl
										mintVersion={target.mintVersion}
										onChange={(slug) =>
											onSlugChange({ planId: target.id, slug })
										}
										slug={effectiveMintSlug({
											selection: slugSelection,
											planId: target.id,
										})}
										takenSlugs={target.takenSlugs}
									/>
								) : undefined
							}
						/>
					);
				})}
			</div>
		</div>
	);
}
