import type { Feature } from "@autumn/shared";
import type { LicenseParentTarget } from "../catalog/catalogPlanPreview";
import { PlanScopeTargetsStep } from "./PlanScopeTargetsStep";

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
	return (
		<PlanScopeTargetsStep
			features={features}
			onChange={onChange}
			selectedKeys={selectedKeys}
			targets={targets}
		/>
	);
}
