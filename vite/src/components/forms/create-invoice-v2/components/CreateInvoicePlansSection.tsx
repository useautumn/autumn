import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { newInvoicePlan } from "../createInvoiceFormSchema";
import { AddRowAction } from "./AddRowAction";
import { CreateInvoicePlanRow } from "./CreateInvoicePlanRow";

export function CreateInvoicePlansSection() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const { plans } = formValues;
	const isChoosing = plans.some((plan) => !plan.planId);

	return (
		<SheetSection title="Plans" withSeparator>
			<div className="space-y-2">
				{plans.map((plan) => (
					<CreateInvoicePlanRow key={plan._id} plan={plan} />
				))}

				{!isChoosing && (
					<AddRowAction
						count={plans.length}
						noun="plan"
						onAdd={() =>
							form.setFieldValue("plans", [...plans, newInvoicePlan()])
						}
					/>
				)}
			</div>
		</SheetSection>
	);
}
