import { resolveCopySourceScope } from "@/components/forms/customer-state/customerStateUtils";
import {
	CopyExistingPlansRow,
	copyExistingPlansTooltip,
} from "@/components/forms/shared/plan-tray/CopyExistingPlansRow";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { invoicePlansToScopedPlans } from "../utils/copyExistingPlansIntoInvoice";

/** Fills the picker row with the customer's current plans at its scope. */
export function CreateInvoiceCopyExistingPlans({
	planIndex,
	scopeLabel,
}: {
	planIndex: number;
	/** Absent when the customer has no entities, so scope isn't a choice. */
	scopeLabel?: string;
}) {
	const { formValues, existingPlans, planHandlers } =
		useCreateInvoiceFormContext();
	const entityId = formValues.plans[planIndex]?.entityId ?? null;
	const copySource = resolveCopySourceScope({
		existingPlans,
		phasePlans: invoicePlansToScopedPlans({ plans: formValues.plans }),
		entityId,
	});

	if (!copySource) return null;

	return (
		<CopyExistingPlansRow
			tooltip={copyExistingPlansTooltip({
				isFallback: copySource.isFallback,
				scopeLabel,
			})}
			onCopy={() =>
				planHandlers.handleCopyExistingPlans({ planIndex, entityId })
			}
		/>
	);
}
