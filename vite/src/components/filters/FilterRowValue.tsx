import { BooleanPill } from "@/views/migrations/migration/shared/BooleanPill";
import type { FilterValueInput, FilterValueInputs } from "./types";

export function FilterRowValue({
	valueInput,
	valueInputs,
	values,
	onChange,
}: {
	valueInput: FilterValueInput;
	valueInputs: FilterValueInputs;
	values: string[];
	onChange: (values: string[]) => void;
}) {
	if (valueInput === "boolean")
		return (
			<div className="flex-1">
				<BooleanPill
					value={values[0] === "true"}
					onChange={(value) => onChange([String(value)])}
				/>
			</div>
		);

	const ValueInput = valueInputs[valueInput];
	if (!ValueInput) return null;
	return <ValueInput className="flex-1" values={values} onChange={onChange} />;
}
