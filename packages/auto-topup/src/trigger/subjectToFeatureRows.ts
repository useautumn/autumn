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

/**
 * A feature's rows the way the server's customer-level selection reads them: every entity's rows pool
 * up (only license seat assignments stay out), so an entity view is not narrowed to its own rows.
 */
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
	/** The feature's own rows. */
	featureId?: string;
	/** Every row whose balance can pay for the feature: its own, and credit systems containing it. */
	fundsFeatureId?: string;
	now: number;
}): AutoTopupFeatureRow<CE, CP>[] => {
	// A loose or pooled row has no product to judge by status, so it stays.
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
