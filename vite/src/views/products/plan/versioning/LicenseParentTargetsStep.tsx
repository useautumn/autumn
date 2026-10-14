import type { Feature } from "@autumn/shared";
import type { LicenseParentTarget } from "../catalog/catalogPlanPreview";
import { PlanScopeTargetsStep } from "./PlanScopeTargetsStep";

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
