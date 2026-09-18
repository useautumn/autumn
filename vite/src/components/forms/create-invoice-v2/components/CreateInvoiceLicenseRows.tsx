import { PlanLicensesSummary } from "@/components/forms/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import { useInvoiceLicenseQuantityEditor } from "../hooks/useInvoiceLicenseQuantityEditor";

export function CreateInvoiceLicenseRows({
	plan,
	planIndex,
	currency,
}: {
	plan: FormInvoicePlan;
	planIndex: number;
	currency?: string;
}) {
	const { features } = useFeaturesQuery();
	const { licenseCatalogByPlanId } = useCreateInvoiceFormContext();
	const quantityEditor = useInvoiceLicenseQuantityEditor({ plan, planIndex });

	const cachedCatalog = licenseCatalogByPlanId.get(plan.planId);
	if (!cachedCatalog) return null;

	return (
		<PlanLicensesSummary
			addLicenses={null}
			cachedCatalog={cachedCatalog}
			currency={currency}
			features={features}
			planId={plan.planId}
			quantityEditor={quantityEditor}
			showDiff={false}
		/>
	);
}
