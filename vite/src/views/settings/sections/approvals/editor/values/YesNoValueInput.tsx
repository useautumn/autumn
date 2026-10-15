import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import type { FilterValueInputProps } from "@/components/filters/types";
import { cn } from "@/lib/utils";

const OPTIONS = [
	{ value: "true", label: "Yes" },
	{ value: "false", label: "No" },
];

/** The boards word booleans as Yes / No; an untouched row reads No, as it saves. */
export const YesNoValueInput = ({
	values,
	onChange,
	className,
}: FilterValueInputProps) => (
	<Select
		value={values[0] ?? "false"}
		onValueChange={(value) => onChange([String(value)])}
		items={OPTIONS}
	>
		<SelectTrigger className={cn("h-8 min-w-0 px-3 text-sm", className)}>
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			{OPTIONS.map((option) => (
				<SelectItem key={option.value} value={option.value}>
					{option.label}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
);
