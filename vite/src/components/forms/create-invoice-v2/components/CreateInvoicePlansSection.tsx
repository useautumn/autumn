import { PlanScopeGroups } from "@/components/forms/shared/plan-tray/PlanScopeGroups";
import { PlanTrayAddRow } from "@/components/forms/shared/plan-tray/PlanTrayAddRow";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { invoicePlansToScopedPlans } from "../utils/copyExistingPlansIntoInvoice";
import { CreateInvoicePlanRow } from "./CreateInvoicePlanRow";

export function CreateInvoicePlansSection() {
	const { formValues, planHandlers } = useCreateInvoiceFormContext();
	const { hasEntities } = useScopeEntitySearch({ selectedEntityId: undefined });
	const { plans } = formValues;

	return (
		<SheetSection title="Plans" withSeparator>
			<PlanScopeGroups
				plans={invoicePlansToScopedPlans({ plans })}
				showHeaders={hasEntities}
				renderPlan={(planIndex) => (
					<CreateInvoicePlanRow
						key={plans[planIndex]?._id}
						planIndex={planIndex}
					/>
				)}
				addRow={
					<PlanTrayAddRow
						label="Add plan"
						onClick={planHandlers.handleAddPlan}
					/>
				}
			/>
		</SheetSection>
	);
}
