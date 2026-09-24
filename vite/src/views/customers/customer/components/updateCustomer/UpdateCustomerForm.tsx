import {
	type ApiBillingDetails,
	BILLING_DETAILS_LABELS,
	type Customer,
} from "@autumn/shared";
import { DialogFooter, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { BillingDetailsSection } from "./billingDetails/BillingDetailsSection";
import { CustomerDetailsFields } from "./CustomerDetailsFields";
import { FIELD_STACK } from "./fieldLayout";
import { useUpdateCustomerForm } from "./useUpdateCustomerForm";

export const UpdateCustomerForm = ({
	customer,
	billingDetails,
	billingDetailsError,
	onSaved,
}: {
	customer: Customer;
	billingDetails: ApiBillingDetails | null | undefined;
	billingDetailsError: unknown;
	onSaved: () => void;
}) => {
	const { form, initialValues, isSaving } = useUpdateCustomerForm({
		customer,
		billingDetails,
		onSaved,
	});
	const stripeId = useStore(form.store, (state) => state.values.stripeId);
	const stripeIdChanged = stripeId !== initialValues.stripeId;
	const isStripeLinked = !!initialValues.stripeId && !stripeIdChanged;

	return (
		<>
			<CustomerDetailsFields form={form} />

			{stripeIdChanged && (
				<InfoBox variant="warning">
					Changing the Stripe Customer ID will break existing subscription
					links. You can sync from Stripe again after updating (Actions → Sync
					from Stripe).
				</InfoBox>
			)}

			<section className={FIELD_STACK}>
				<h4 className="text-sm font-semibold">
					{BILLING_DETAILS_LABELS.section}
				</h4>
				<BillingDetailsSection
					form={form}
					isStripeLinked={isStripeLinked}
					loadError={billingDetailsError}
				/>
			</section>

			<DialogFooter>
				<ShortcutButton
					variant="primary"
					onClick={() => form.handleSubmit()}
					isLoading={isSaving}
					metaShortcut="enter"
					className="w-full"
				>
					Update Customer
				</ShortcutButton>
			</DialogFooter>
		</>
	);
};
