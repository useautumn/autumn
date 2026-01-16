import { createFormHook } from "@tanstack/react-form";
import { SubmitButton } from "@/components/general/form/buttons/submit-button";
import { CheckboxField } from "@/components/general/form/fields/checkbox-field";
import { NumberField } from "@/components/general/form/fields/number-field";
import { QuantityField } from "@/components/general/form/fields/quantity-field";
import { SelectField } from "@/components/general/form/fields/select-field";
import { TextField } from "@/components/general/form/fields/text-field";
import { fieldContext, formContext } from "./form-context";

export const { useAppForm, withForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField,
		SelectField,
		QuantityField,
		CheckboxField,
		NumberField,
	},
	formComponents: {
		SubmitButton,
	},
});
