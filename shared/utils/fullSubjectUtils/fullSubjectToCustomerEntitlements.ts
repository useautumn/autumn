import { isEntityCusEnt } from "../../index.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { CustomerEntitlementFilters } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import { cusEntMatchesEntity } from "../cusEntUtils/filterCusEntUtils.js";
import { sortCusEntsForDeduction } from "../cusEntUtils/sortCusEntsForDeduction.js";
import { notNullish } from "../utils.js";

export const fullSubjectToCustomerEntitlements = ({
	fullSubject,
	inStatuses = [CusProductStatus.Active, CusProductStatus.PastDue],
	reverseOrder = false,
	featureIds,
	customerEntitlementFilters,
}: {
	fullSubject: FullSubject;
	inStatuses?: CusProductStatus[];
	reverseOrder?: boolean;
	featureIds?: string[];
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	let customerEntitlements: FullCusEntWithFullCusProduct[] = [];

	for (const customerProduct of fullSubject.customer_products) {
		if (!inStatuses.includes(customerProduct.status)) continue;

		customerEntitlements.push(
			...customerProduct.customer_entitlements.map((customerEntitlement) => ({
				...customerEntitlement,
				customer_product: customerProduct,
			})),
		);
	}

	for (const customerEntitlement of fullSubject.extra_customer_entitlements) {
		customerEntitlements.push({
			...customerEntitlement,
			customer_product: null,
		});
	}

	if (featureIds) {
		customerEntitlements = customerEntitlements.filter((customerEntitlement) =>
			featureIds.includes(customerEntitlement.entitlement.feature.id),
		);
	}

	if (fullSubject.entity) {
		customerEntitlements = customerEntitlements.filter((customerEntitlement) =>
			cusEntMatchesEntity({
				cusEnt: customerEntitlement,
				entity: fullSubject.entity,
			}),
		);
	}

	const now = Date.now();
	customerEntitlements = customerEntitlements.filter(
		(customerEntitlement) =>
			!customerEntitlement.expires_at || customerEntitlement.expires_at > now,
	);

	sortCusEntsForDeduction({
		cusEnts: customerEntitlements,
		reverseOrder,
		entityId: fullSubject.entity?.id ?? undefined,
		customerEntitlementFilters,
	});

	if (
		customerEntitlementFilters?.cusEntIds &&
		customerEntitlementFilters.cusEntIds.length > 0
	) {
		customerEntitlements = customerEntitlements.filter((customerEntitlement) =>
			customerEntitlementFilters.cusEntIds?.includes(customerEntitlement.id),
		);
	}

	if (notNullish(customerEntitlementFilters?.interval)) {
		customerEntitlements = customerEntitlements.filter(
			(customerEntitlement) =>
				customerEntitlement.entitlement.interval ===
				customerEntitlementFilters.interval,
		);
	}

	if (notNullish(customerEntitlementFilters?.balanceId)) {
		customerEntitlements = customerEntitlements.filter(
			(customerEntitlement) =>
				(customerEntitlement.external_id ?? customerEntitlement.id) ===
				customerEntitlementFilters.balanceId,
		);
	}

	if (
		fullSubject.entity?.id &&
		fullSubject.customer.config?.disable_pooled_balance
	) {
		customerEntitlements = customerEntitlements.filter((ce) =>
			isEntityCusEnt({ cusEnt: ce }),
		);
	}

	return customerEntitlements;
};
