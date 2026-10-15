import type { FilterValueInputProps } from "@/components/filters/types";
import { ChipMultiSelect } from "../ChipMultiSelect";
import { type OptionSource, useValueOptions } from "./useValueOptions";

/** Picks ids from a list; more than one turns "is" into "is any of". */
export const OptionsValueInput = ({
	values,
	onChange,
	className,
	source,
}: FilterValueInputProps & { source: OptionSource }) => {
	const options = useValueOptions({ source });
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
