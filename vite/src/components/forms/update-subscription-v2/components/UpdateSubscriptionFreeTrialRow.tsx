import { FreeTrialConfigRow } from "@/components/forms/shared/FreeTrialConfigRow";
import {
	FREE_TRIAL_LENGTH_FIELDS,
	FreeTrialLengthFields,
} from "@/components/forms/shared/FreeTrialLengthFields";
import { DEFAULT_TRIAL_LENGTH } from "@/components/forms/shared/utils/freeTrialFormValues";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionFreeTrialRow() {
	const { form, formValues, formContext, trialState } =
		useUpdateSubscriptionFormContext();
	const trialExpanded = trialState.isTrialExpanded && !trialState.removeTrial;

	const handleToggle = (enabled: boolean) => {
		if (enabled) {
			trialState.handleToggleTrial();
			if (trialState.isCurrentlyTrialing) return;
			const productTrial = formContext.product?.free_trial;
			form.setFieldValue(
				"trialLength",
				productTrial ? Number(productTrial.length) : DEFAULT_TRIAL_LENGTH,
			);
			if (productTrial?.duration) {
				form.setFieldValue("trialDuration", productTrial.duration);
			}
			return;
		}
		if (trialState.isCurrentlyTrialing) {
			trialState.handleEndTrial();
			return;
		}
		trialState.setIsTrialExpanded(false);
		form.setFieldValue("trialLength", null);
	};

	return (
		<FreeTrialConfigRow
			form={form}
			lengthFields={
				<FreeTrialLengthFields form={form} fields={FREE_TRIAL_LENGTH_FIELDS} />
			}
			expanded={trialExpanded}
			checked={trialExpanded}
			trialCardRequired={!!formValues.trialCardRequired}
			onToggle={handleToggle}
		/>
	);
}
