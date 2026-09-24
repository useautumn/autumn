import { getBackendErr } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import type { UpdateCustomerForm } from "../useUpdateCustomerForm";
import { BillingDetailsFields } from "./BillingDetailsFields";

export const BillingDetailsSection = ({
	form,
	isStripeLinked,
	loadError,
}: {
	form: UpdateCustomerForm;
	isStripeLinked: boolean;
	loadError: unknown;
}) => {
	if (!isStripeLinked) {
		return (
			<InfoBox variant="note">
				Billing details are stored on the Stripe customer. Link a Stripe
				customer (and save) to edit address, tax IDs and invoice fields.
			</InfoBox>
		);
	}
	if (loadError) {
		return (
			<InfoBox variant="error">
				{getBackendErr(loadError, "Couldn't load billing details from Stripe.")}
			</InfoBox>
		);
	}
	return <BillingDetailsFields form={form} />;
};
