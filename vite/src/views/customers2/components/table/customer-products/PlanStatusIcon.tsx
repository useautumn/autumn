import { StatusChipIcon } from "@autumn/ui";
import { PLAN_STATUS_CONFIG } from "./planStatusConfig";
import type { PlanStatus } from "./resolvePlanStatus";

export function PlanStatusIcon({ planStatus }: { planStatus: PlanStatus }) {
	const { icon: Icon, iconClassName } = PLAN_STATUS_CONFIG[planStatus];

	return (
		<StatusChipIcon icon={<Icon strokeWidth={3} />} className={iconClassName} />
	);
}
