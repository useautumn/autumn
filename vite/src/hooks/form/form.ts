import { createFormHook } from "@tanstack/react-form";
import { SubmitButton } from "@/components/general/form/buttons/submit-button";
import { TextField } from "@/components/general/form/fields/text-field";
import { fieldContext, formContext } from "./form-context";

export const { useAppForm, withForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField,
	},
	formComponents: {
		SubmitButton,
	},
});
