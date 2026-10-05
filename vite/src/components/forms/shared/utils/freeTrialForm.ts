import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import type { UseCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import type { FreeTrialFormValues } from "./freeTrialFormValues";

/** Every billing form that renders the shared free trial row. */
export type FreeTrialForm =
	| UseAttachForm
	| UseUpdateSubscriptionForm
	| UseCustomerStateForm;

export const applyFreeTrialFormValues = ({
	form,
	values,
}: {
	form: FreeTrialForm;
	values: Partial<FreeTrialFormValues>;
}) => {
	if (values.trialEnabled !== undefined) {
		form.setFieldValue("trialEnabled", values.trialEnabled);
	}
	if (values.trialLength !== undefined) {
		form.setFieldValue("trialLength", values.trialLength);
	}
	if (values.trialDuration !== undefined) {
		form.setFieldValue("trialDuration", values.trialDuration);
	}
	if (values.trialCardRequired !== undefined) {
		form.setFieldValue("trialCardRequired", values.trialCardRequired);
	}
};
