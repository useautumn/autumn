import { resolveCopySourceScope } from "@/components/forms/customer-state/customerStateUtils";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import {
	customerStatePlanToInvoicePlan,
	type InvoiceExistingPlan,
} from "./customerStatePlanToInvoicePlan";

export const invoicePlansToScopedPlans = ({
	plans,
}: {
	plans: FormInvoicePlan[];
}) =>
	plans.map((plan) => ({ productId: plan.planId, entityId: plan.entityId }));

export function copyExistingPlansIntoInvoice({
	plans,
	planIndex,
	entityId,
	existingPlans,
}: {
	plans: FormInvoicePlan[];
	planIndex: number;
	entityId: string | null;
	existingPlans: InvoiceExistingPlan[];
}): FormInvoicePlan[] | null {
	const copySource = resolveCopySourceScope({
		existingPlans,
		phasePlans: invoicePlansToScopedPlans({ plans }),
		entityId,
	});
	if (!copySource) return null;

	return [
		...plans.slice(0, planIndex),
		...copySource.plans.map((plan) => customerStatePlanToInvoicePlan({ plan })),
		...plans.slice(planIndex + 1),
	];
}
