import type { FilterValueInputProps } from "@/components/filters/types";
import type { ChipOption } from "../ChipMultiSelect";
import { ChipMultiSelect } from "../ChipMultiSelect";

/** Picks ids from a list; more than one turns "is" into "is any of". */
export const OptionsValueInput = ({
	values,
	onChange,
	className,
	useOptions,
}: FilterValueInputProps & { useOptions: () => ChipOption[] }) => {
	const options = useOptions();
	return (
		<div className={className}>
			<ChipMultiSelect
				ariaLabel="Value"
				placeholder="Choose…"
				groups={[{ options }]}
				value={values}
				onToggle={(value) =>
					onChange(
						values.includes(value)
							? values.filter((existing) => existing !== value)
							: [...values, value],
					)
				}
			/>
		</div>
	);
};
