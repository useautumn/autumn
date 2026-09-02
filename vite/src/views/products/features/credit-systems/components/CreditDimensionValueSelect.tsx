import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";

const ANY_VALUE = "__any__";

interface CreditDimensionValueSelectProps {
	values: string[];
	value: string | undefined;
	onValueChange: (value: string | undefined) => void;
	ariaLabel: string;
}

/** A table-cell select over a field's values; unset reads as "any". */
export function CreditDimensionValueSelect({
	values,
	value,
	onValueChange,
	ariaLabel,
}: CreditDimensionValueSelectProps) {
	return (
		<Select
			value={value ?? ANY_VALUE}
			onValueChange={(next) =>
				onValueChange(next === ANY_VALUE ? undefined : next)
			}
		>
			<SelectTrigger
				aria-label={ariaLabel}
				className="w-full !border-0 !shadow-none !ring-0 !bg-transparent !p-0 !px-0.5 !rounded-none"
			>
				<SelectValue>
					{value ?? <span className="text-subtle">any</span>}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ANY_VALUE}>
					<span className="text-subtle">any</span>
				</SelectItem>
				{values.map((option) => (
					<SelectItem key={option} value={option}>
						{option}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
