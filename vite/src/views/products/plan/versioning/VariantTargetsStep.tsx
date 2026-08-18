import type { Feature } from "@autumn/shared";
import type { PropagationTarget } from "../catalog/catalogPlanPreview";
import { PropagationConflictWarning } from "./PropagationConflictWarning";
import { PropagationTargetRow } from "./PropagationTargetRow";

/**
 * Variants follow the base plan's own versioning strategy, so they get a plain
 * follow/don't-follow checkbox with no version scope of their own.
 */
export function VariantTargetsStep({
	features,
	targets,
	selectedIds,
	onToggle,
}: {
	features?: Feature[];
	targets: PropagationTarget[];
	selectedIds: string[];
	onToggle: (id: string) => void;
}) {
	if (targets.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<PropagationConflictWarning
				hasConflicts={targets.some((target) => target.conflicts.length > 0)}
			/>
			<div className="flex flex-col gap-2">
				{targets.map((target) => (
					<PropagationTargetRow
						checked={selectedIds.includes(target.id)}
						conflicts={target.conflicts}
						detail={target.detail}
						diff={target}
						features={features}
						key={target.id}
						name={target.name}
						onToggle={() => onToggle(target.id)}
					/>
				))}
			</div>
		</div>
	);
}
