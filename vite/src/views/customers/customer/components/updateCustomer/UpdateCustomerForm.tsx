import {
	type ApiBillingDetails,
	BILLING_DETAILS_LABELS,
	type Customer,
} from "@autumn/shared";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	DialogFooter,
	ShortcutButton,
} from "@autumn/ui";
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

			<Accordion className="-mx-1">
				<AccordionItem value="billing-details">
					<AccordionTrigger className="px-1 py-1 font-semibold">
						{BILLING_DETAILS_LABELS.section}
					</AccordionTrigger>
					<AccordionContent className={`${FIELD_STACK} px-1 pt-2 pb-1`}>
						<BillingDetailsSection
							form={form}
							isStripeLinked={isStripeLinked}
							loadError={billingDetailsError}
						/>
					</AccordionContent>
				</AccordionItem>
			</Accordion>

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
