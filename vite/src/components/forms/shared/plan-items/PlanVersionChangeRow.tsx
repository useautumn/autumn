import { motion } from "motion/react";
import { VersionChangeRow } from "@/components/forms/update-subscription-v2/components/VersionChangeRow";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

interface VersionChange {
	currentVersion: number;
	selectedVersion: number;
}

export function PlanVersionChangeRow({
	versionChange,
}: {
	versionChange?: VersionChange | null;
}) {
	if (
		!versionChange ||
		versionChange.selectedVersion === versionChange.currentVersion
	) {
		return null;
	}

	return (
		<motion.div
			key="version-change"
			layout="position"
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<VersionChangeRow
				currentVersion={versionChange.currentVersion}
				selectedVersion={versionChange.selectedVersion}
			/>
		</motion.div>
	);
}
