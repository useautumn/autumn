import { isEntityCusEnt } from "../../index.js";
import type { CustomerEntitlementFilters } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type {
	FullCusEntWithFullCusProductView,
	FullCusProductView,
	FullCustomerEntitlementView,
	FullSubjectView,
} from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import { customerEntitlementFundsFeature } from "../cusEntUtils/classifyCusEnt/customerEntitlementFundsFeature.js";
import { isCusEntExpired } from "../cusEntUtils/classifyCusEnt/isCusEntExpired.js";
import { isPooledBalanceSourceCustomerEntitlement } from "../cusEntUtils/classifyCusEnt/isPooledBalanceCustomerEntitlement.js";
import { cusEntMatchesEntity } from "../cusEntUtils/filterCusEntUtils.js";
import { sortCusEntsForDeduction } from "../cusEntUtils/sortCusEntsForDeduction.js";
import { notNullish } from "../utils.js";
import { memoOnFullSubject } from "./fullSubjectRowsMemo.js";

/**
 * Every row the subject holds with the product that granted it, loose and
 * pooled rows with none, in product order: the one flatten every selection
 * filters from. A view marked immutable keeps it, so the row copies are made
 * once per view rather than once per selection.
 */
export const fullSubjectToRowsWithProduct = <
	CE extends FullCustomerEntitlementView,
	CP extends FullCusProductView,
>({
	fullSubject,
}: {
	fullSubject: FullSubjectView<CE, CP>;
}): FullCusEntWithFullCusProductView<
	CE,
	CP & { customer_entitlements: CE[] }
>[] =>
	memoOnFullSubject({
		fullSubject,
		key: "rowsWithProduct",
		build: () => {
			const rows: FullCusEntWithFullCusProductView<
				CE,
				CP & { customer_entitlements: CE[] }
			>[] = [];
			for (const customerProduct of fullSubject.customer_products) {
				for (const customerEntitlement of customerProduct.customer_entitlements) {
					rows.push({
						...customerEntitlement,
						customer_product: customerProduct,
					});
				}
			}
			for (const customerEntitlement of fullSubject.extra_customer_entitlements) {
				rows.push({ ...customerEntitlement, customer_product: null });
			}
			// Guarded for subjects built without going through the schema, which fills
			// this in via .default([]).
			for (const customerEntitlement of fullSubject.pooled_customer_entitlements ??
				[]) {
				rows.push({ ...customerEntitlement, customer_product: null });
			}
			return rows;
		},
	});

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
	now = Date.now(),
}: {
	fullSubject: FullSubjectView<CE, CP>;
	inStatuses?: CusProductStatus[];
	reverseOrder?: boolean;
	featureIds?: string[];
	/** Membership by EFFECTIVE credit schema (plan-item feature_override,
	 * else catalog) — per cusEnt, unlike the per-feature featureIds filter. */
	fundsFeatureId?: string;
	customerEntitlementFilters?: CustomerEntitlementFilters;
	/** Expiry is judged against this instant; a replayed command passes its own. */
	now?: number;
}) => {
	type Selected = FullCusEntWithFullCusProductView<
		CE,
		CP & { customer_entitlements: CE[] }
	>;
	// The kept rows are only filtered here, never edited; a loose or pooled row has no product to judge by status.
	let customerEntitlements: Selected[] = fullSubjectToRowsWithProduct({
		fullSubject,
	}).filter(
		(customerEntitlement) =>
			(customerEntitlement.customer_product === null ||
				inStatuses.includes(customerEntitlement.customer_product.status)) &&
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
