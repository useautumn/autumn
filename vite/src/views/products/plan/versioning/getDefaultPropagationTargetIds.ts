import type { LicenseParentTarget } from "../catalog/catalogPlanPreview";

/**
 * Pin every conflict-free parent version, collapsing to the whole-plan key when
 * a parent has no conflicting version so the row reads "All versions".
 */
export const getDefaultLicenseParentKeys = ({
	targets,
}: {
	targets: LicenseParentTarget[];
}): string[] =>
	targets.flatMap((target) => {
		const clean = target.versions.filter(
			(entry) => entry.conflicts.length === 0,
		);
		if (clean.length === 0) return [];
		if (clean.length === target.versions.length) return [target.planId];
		return clean.map((entry) => entry.key);
	});
