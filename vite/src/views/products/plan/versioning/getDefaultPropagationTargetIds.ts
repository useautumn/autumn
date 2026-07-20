import type { PropagationTarget } from "./PropagationTargetsStep";

export const getDefaultPropagationTargetIds = ({
	targets,
}: {
	targets: PropagationTarget[];
}): string[] => {
	const ids: string[] = [];
	for (const target of targets) {
		if (target.conflicts.length === 0) ids.push(target.id);
	}
	return ids;
};
