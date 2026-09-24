import type { ApiBillingDetails, Customer } from "@autumn/shared";
import { DialogFooter, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { BillingDetailsFields } from "./billingDetails/BillingDetailsFields";
import { CustomerDetailsFields } from "./CustomerDetailsFields";
import { FIELD_STACK } from "./fieldLayout";
import { useUpdateCustomerForm } from "./useUpdateCustomerForm";

export const UpdateCustomerForm = ({
	customer,
	billingDetails,
	onSaved,
}: {
	customer: Customer;
	billingDetails: ApiBillingDetails | null | undefined;
	onSaved: () => void;
}) => {
	const { form, initialValues, isSaving } = useUpdateCustomerForm({
		customer,
		billingDetails,
		onSaved,
	});
	const stripeId = useStore(form.store, (state) => state.values.stripeId);
	const stripeIdChanged = stripeId !== initialValues.stripeId;
	const canEditBillingDetails = !!initialValues.stripeId && !stripeIdChanged;

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
				<h4 className="text-sm font-semibold">Billing details</h4>
				{canEditBillingDetails ? (
					<BillingDetailsFields form={form} />
				) : (
					<InfoBox variant="note">
						Billing details are stored on the Stripe customer. Link a Stripe
						customer (and save) to edit address, tax IDs and invoice fields.
					</InfoBox>
				)}
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
