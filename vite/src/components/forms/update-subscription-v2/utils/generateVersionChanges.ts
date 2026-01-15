import type { SummaryItem } from "../types/summary";

export function generateVersionChanges({
	currentVersion,
	selectedVersion,
}: {
	currentVersion: number;
	selectedVersion: number;
}): SummaryItem[] {
	if (selectedVersion === currentVersion) {
		return [];
	}

	return [
		{
			id: "version-change",
			type: "version",
			label: "Plan Version",
			oldValue: currentVersion,
			newValue: selectedVersion,
		},
	];
}
