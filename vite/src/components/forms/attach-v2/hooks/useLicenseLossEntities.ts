import type { FullCustomer } from "@autumn/shared";
import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";

export type LicenseLossEntity = { id: string; label: string };

/** Returns affected entities for complete license removal only. */
export function useLicenseLossEntities(): LicenseLossEntity[] {
	const { customerId, product, formValues, previewDiff } =
		useAttachFormContext();
	const { planLicenses } = usePlanLicensesQuery(product?.id);
	const { assignments } = useLicenseBalancesQuery({ customerId });
	const { customer } = useCusQuery();

	const keepsAnyLicense =
		planLicenses.length + (formValues.addLicenses?.length ?? 0) > 0;
	if (keepsAnyLicense) return [];

	const outgoingLicenseIds = new Set(
		previewDiff.outgoingLicenses.map((license) => license.license_plan_id),
	);
	if (outgoingLicenseIds.size === 0) return [];

	const entityById = new Map(
		((customer as FullCustomer | null)?.entities ?? []).map((entity) => [
			entity.id,
			entity,
		]),
	);

	const labelById = new Map<string, string>();
	for (const assignment of assignments) {
		if (!outgoingLicenseIds.has(assignment.license_plan_id)) continue;
		if (labelById.has(assignment.entity_id)) continue;
		const entity = entityById.get(assignment.entity_id);
		labelById.set(
			assignment.entity_id,
			entity?.name || entity?.id || assignment.entity_id,
		);
	}

	return [...labelById].map(([id, label]) => ({ id, label }));
}
