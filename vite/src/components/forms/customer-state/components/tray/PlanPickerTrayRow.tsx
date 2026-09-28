import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CustomerStatePlanPicker } from "../CustomerStatePlanPicker";
import { PlanTrayRow } from "./PlanTrayRow";

/** The empty plan row; its scope comes from the group it was added under. */
export function PlanPickerTrayRow({
	disabled,
	...pickerProps
}: ComponentProps<typeof CustomerStatePlanPicker>) {
	return (
		<PlanTrayRow flush>
			<div className={cn("min-w-0", disabled && "opacity-60")}>
				<CustomerStatePlanPicker {...pickerProps} disabled={disabled} />
			</div>
		</PlanTrayRow>
	);
}
