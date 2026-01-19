import type { ItemEdit } from "./itemEditTypes.js";

/** Generates edit items for plan version changes */
export function generateVersionChanges({
	originalVersion,
	updatedVersion,
}: {
	originalVersion: number;
	updatedVersion: number;
}): ItemEdit[] {
	if (updatedVersion === originalVersion) {
		return [];
	}

	const isUpgrade = updatedVersion > originalVersion;

	return [
		{
			id: "version-change",
			type: "version",
			label: "Plan Version",
			icon: "version",
			description: isUpgrade
				? `Plan version upgraded from v${originalVersion} to v${updatedVersion}`
				: `Plan version downgraded from v${originalVersion} to v${updatedVersion}`,
			oldValue: originalVersion,
			newValue: updatedVersion,
			isUpgrade,
		},
	];
}
