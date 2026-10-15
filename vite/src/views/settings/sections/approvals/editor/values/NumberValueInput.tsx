import { InputGroup, InputGroupAddon, InputGroupInput } from "@autumn/ui";
import type { FilterValueInputProps } from "@/components/filters/types";
import { cn } from "@/lib/utils";

export const NumberValueInput = ({
	values,
	onChange,
	className,
	suffix,
}: FilterValueInputProps & { suffix?: string }) => (
	<InputGroup className={cn("h-8", className)}>
		<InputGroupInput
			type="number"
			aria-label="Value"
			placeholder="0"
			value={values[0] ?? ""}
			onChange={(event) =>
				onChange(event.target.value === "" ? [] : [event.target.value])
			}
		/>
		{suffix && <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>}
	</InputGroup>
);
