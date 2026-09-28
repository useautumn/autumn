import type { ComponentProps } from "react";
import type { PlanRowScope } from "@/components/forms/shared/ScopedPlanRow";
import { cn } from "@/lib/utils";
import { CustomerStatePlanPicker } from "../CustomerStatePlanPicker";
import { PlanTrayRow } from "./PlanTrayRow";

/**
 * The empty plan row. Group conflicts are per scope, so the scope stays pickable
 * before a plan is chosen, or every group would read as taken at customer level.
 */
export function PlanPickerTrayRow({
	scope,
	disabled,
	...pickerProps
}: ComponentProps<typeof CustomerStatePlanPicker> & { scope?: PlanRowScope }) {
	return (
		<PlanTrayRow flush>
			<div className="flex items-center">
				<div className={cn("min-w-0 flex-1", disabled && "opacity-60")}>
					<CustomerStatePlanPicker {...pickerProps} disabled={disabled} />
				</div>
				{scope && <div className="shrink-0 pr-2">{scope.picker}</div>}
			</div>
		</PlanTrayRow>
	);
}
