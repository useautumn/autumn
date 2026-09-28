import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CustomerStatePlanPicker } from "../CustomerStatePlanPicker";

export function PlanPickerTrayRow({
	disabled,
	...pickerProps
}: ComponentProps<typeof CustomerStatePlanPicker>) {
	return (
		<div className={cn("min-w-0", disabled && "opacity-60")}>
			<CustomerStatePlanPicker {...pickerProps} disabled={disabled} />
		</div>
	);
}
