import type { ComponentProps } from "react";
import {
	type PlanRowScope,
	ScopedPlanRow,
} from "@/components/forms/shared/ScopedPlanRow";
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
		<PlanTrayRow>
			<ScopedPlanRow scope={scope}>
				<div
					className={cn(
						"group relative min-w-0 flex-1",
						disabled && "opacity-60",
					)}
				>
					<CustomerStatePlanPicker {...pickerProps} disabled={disabled} />
				</div>
			</ScopedPlanRow>
		</PlanTrayRow>
	);
}
