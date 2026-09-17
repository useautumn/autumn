import { isEntityCusEnt } from "../../index.js";
import type { CustomerEntitlementFilters } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type {
	FullCustomerEntitlementView,
	FullCusProductView,
	FullCusEntWithFullCusProductView,
	FullSubjectView,
} from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import { customerEntitlementFundsFeature } from "../cusEntUtils/classifyCusEnt/customerEntitlementFundsFeature.js";
import { isCusEntExpired } from "../cusEntUtils/classifyCusEnt/isCusEntExpired.js";
import { isPooledBalanceSourceCustomerEntitlement } from "../cusEntUtils/classifyCusEnt/isPooledBalanceCustomerEntitlement.js";
import { cusEntMatchesEntity } from "../cusEntUtils/filterCusEntUtils.js";
import { sortCusEntsForDeduction } from "../cusEntUtils/sortCusEntsForDeduction.js";
import { notNullish } from "../utils.js";

/** Generic over the row shape so the same selection serves a FullSubject and the balance worker's leaner view. */
export const fullSubjectToCustomerEntitlements = <
	CE extends FullCustomerEntitlementView,
	CP extends FullCusProductView,
>({
	fullSubject,
	inStatuses = [CusProductStatus.Active, CusProductStatus.PastDue],
	reverseOrder = false,
	featureIds,
	fundsFeatureId,
	customerEntitlementFilters,
}: {
	fullSubject: FullSubjectView<CE, CP>;
	inStatuses?: CusProductStatus[];
	reverseOrder?: boolean;
	featureIds?: string[];
	/** Membership by EFFECTIVE credit schema (plan-item feature_override,
	 * else catalog) — per cusEnt, unlike the per-feature featureIds filter. */
	fundsFeatureId?: string;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	type Selected = FullCusEntWithFullCusProductView<
		CE,
		CP & { customer_entitlements: CE[] }
	>;
	let customerEntitlements: Selected[] = [];

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

	// Guarded for subjects built without going through the schema, which fills
	// this in via .default([]).
	for (const customerEntitlement of fullSubject.pooled_customer_entitlements ??
		[]) {
		customerEntitlements.push({
			...customerEntitlement,
			customer_product: null,
		});
	}

	customerEntitlements = customerEntitlements.filter(
		(customerEntitlement) =>
			!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement }),
	);

	if (featureIds) {
		customerEntitlements = customerEntitlements.filter((customerEntitlement) =>
			featureIds.includes(customerEntitlement.entitlement.feature.id),
		);
	}

	if (fundsFeatureId) {
		customerEntitlements = customerEntitlements.filter((customerEntitlement) =>
			customerEntitlementFundsFeature({
				customerEntitlement,
				featureId: fundsFeatureId,
			}),
		);
	}

	customerEntitlements = customerEntitlements.filter((customerEntitlement) =>
		cusEntMatchesEntity({
			cusEnt: customerEntitlement,
			entity: fullSubject.entity,
		}),
	);

	const now = Date.now();
	customerEntitlements = customerEntitlements.filter(
		(customerEntitlement) =>
			!isCusEntExpired({ cusEnt: customerEntitlement, now }),
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
		fullSubject.customer?.config?.disable_pooled_balance
	) {
		customerEntitlements = customerEntitlements.filter((ce) =>
			isEntityCusEnt({ cusEnt: ce }),
		);
	}

	return customerEntitlements;
};
