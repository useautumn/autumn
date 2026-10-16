import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import type { FilterValueInputProps } from "@/components/filters/types";
import { cn } from "@/lib/utils";
import { DEFAULT_TRIAL_UNIT } from "../ruleRowCodec";
import { NumberValueInput } from "./NumberValueInput";

const UNITS = [
	{ value: "day", label: "days" },
	{ value: "month", label: "months" },
	{ value: "year", label: "years" },
];

/** A trial length as `[length, unit]`. */
export const TrialValueInput = ({
	values,
	onChange,
	className,
}: FilterValueInputProps) => {
	const [length = "", unit = DEFAULT_TRIAL_UNIT] = values;
	return (
		<div className={cn("flex min-w-0 gap-2", className)}>
			<NumberValueInput
				className="w-14 shrink-0"
				values={length ? [length] : []}
				onChange={([next = ""]) => onChange([next, unit])}
			/>
			<Select
				value={unit}
				onValueChange={(next) => onChange([length, String(next)])}
				items={UNITS}
			>
				<SelectTrigger className="h-8 min-w-0 flex-1 px-3 text-sm">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{UNITS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
};
