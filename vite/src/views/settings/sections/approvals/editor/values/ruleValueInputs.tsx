import type { FilterValueInputs } from "@/components/filters/types";
import { CustomerValuePicker } from "@/views/migrations/migration/filters/CustomerValuePicker";
import { PlanVersionPicker } from "@/views/migrations/migration/shared/PlanVersionPicker";

/** The value inputs U1's rows render, keyed by each field's `valueInput`. */
export const RULE_VALUE_INPUTS: FilterValueInputs = {
	customer: ({ values, ...props }) => (
		<CustomerValuePicker selectedValues={values} {...props} />
	),
	plan: PlanVersionPicker,
};
