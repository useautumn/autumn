import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import type { UseCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import type { FreeTrialFormValues } from "./freeTrialFormValues";

/** Every billing form that renders the shared free trial row. */
export type FreeTrialForm =
	| UseAttachForm
	| UseUpdateSubscriptionForm
	| UseCustomerStateForm;

const PROGRAMMATIC_WRITE = { dontRunListeners: true };

/** Programmatic writes skip field listeners, so only user input counts as an edit. */
export const applyFreeTrialFormValues = ({
	form,
	values,
}: {
	form: FreeTrialForm;
	values: Partial<FreeTrialFormValues>;
}) => {
	if (values.trialEnabled !== undefined) {
		form.setFieldValue("trialEnabled", values.trialEnabled, PROGRAMMATIC_WRITE);
	}
	if (values.trialLength !== undefined) {
		form.setFieldValue("trialLength", values.trialLength, PROGRAMMATIC_WRITE);
	}
	if (values.trialDuration !== undefined) {
		form.setFieldValue(
			"trialDuration",
			values.trialDuration,
			PROGRAMMATIC_WRITE,
		);
	}
	if (values.trialCardRequired !== undefined) {
		form.setFieldValue(
			"trialCardRequired",
			values.trialCardRequired,
			PROGRAMMATIC_WRITE,
		);
	}
};
