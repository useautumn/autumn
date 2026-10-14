import {
	CusProductStatus,
	customerEntitlementFundsFeature,
	fullSubjectToRowsWithProduct,
	isCusEntExpired,
	isCustomerProductLicenseAssignment,
	isEntityCusEnt,
	isPooledBalanceSourceCustomerEntitlement,
	sortCusEntsForDeduction,
} from "@autumn/shared";
import type {
	AutoTopupCustomerEntitlement,
	AutoTopupCustomerProduct,
	AutoTopupFeatureRow,
	AutoTopupSubject,
} from "./types/autoTopupSubject.js";

const ROW_STATUSES: CusProductStatus[] = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
];

export const subjectToFeatureRows = <
	CE extends AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct,
>({
	fullSubject,
	featureId,
	fundsFeatureId,
	now,
}: {
	fullSubject: AutoTopupSubject<CE, CP>;
	featureId?: string;
	fundsFeatureId?: string;
	now: number;
}): AutoTopupFeatureRow<CE, CP>[] => {
	const rows: AutoTopupFeatureRow<CE, CP>[] = fullSubjectToRowsWithProduct({
		fullSubject,
	}).filter(
		(row) =>
			row.customer_product === null ||
			ROW_STATUSES.includes(row.customer_product.status),
	);

	const selected = rows.filter(
		(row) =>
			!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement: row }) &&
			(featureId === undefined || row.entitlement.feature.id === featureId) &&
			(fundsFeatureId === undefined ||
				customerEntitlementFundsFeature({
					customerEntitlement: row,
					featureId: fundsFeatureId,
				})) &&
			!isCustomerProductLicenseAssignment(row.customer_product ?? undefined) &&
			!isCusEntExpired({ cusEnt: row, now }),
	);
	sortCusEntsForDeduction({
		cusEnts: selected,
		entityId: fullSubject.entity?.id ?? undefined,
	});

	const entityPoolsAlone =
		fullSubject.entity?.id &&
		fullSubject.customer.config?.disable_pooled_balance;
	return entityPoolsAlone
		? selected.filter((row) => isEntityCusEnt({ cusEnt: row }))
		: selected;
};
