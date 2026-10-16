import type { FilterValueInputs } from "@/components/filters/types";
import { CustomerValuePicker } from "@/views/migrations/migration/filters/CustomerValuePicker";
import { PlanVersionPicker } from "@/views/migrations/migration/shared/PlanVersionPicker";
import { NumberValueInput } from "./NumberValueInput";
import { OptionsValueInput } from "./OptionsValueInput";
import { QuantityValueInput } from "./QuantityValueInput";
import { TrialValueInput } from "./TrialValueInput";
import { OPTION_HOOKS } from "./useValueOptions";
import { YesNoValueInput } from "./YesNoValueInput";

// Module-level so each input keeps its identity across renders (and its focus).
const OPTION_INPUTS: FilterValueInputs = Object.fromEntries(
	Object.entries(OPTION_HOOKS).map(([source, useOptions]) => [
		source,
		(props) => <OptionsValueInput {...props} useOptions={useOptions} />,
	]),
);

/** The value inputs U1's rows render, keyed by each field's `valueInput`. */
export const RULE_VALUE_INPUTS: FilterValueInputs = {
	...OPTION_INPUTS,
	customer: ({ values, ...props }) => (
		<CustomerValuePicker selectedValues={values} {...props} />
	),
	plan: PlanVersionPicker,
	number: NumberValueInput,
	percent: (props) => <NumberValueInput {...props} suffix="%" />,
	days: (props) => <NumberValueInput {...props} suffix="days" />,
	trial: TrialValueInput,
	yes_no: YesNoValueInput,
	quantity: QuantityValueInput,
};
