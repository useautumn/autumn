import { resolveCopySourceScope } from "@/components/forms/customer-state/customerStateUtils";
import {
	CopyExistingPlansRow,
	copyExistingPlansTooltip,
} from "@/components/forms/shared/plan-tray/CopyExistingPlansRow";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { invoicePlansToScopedPlans } from "../utils/copyExistingPlansIntoInvoice";

export function CreateInvoiceCopyExistingPlans({
	planIndex,
	scopeLabel,
}: {
	planIndex: number;
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
