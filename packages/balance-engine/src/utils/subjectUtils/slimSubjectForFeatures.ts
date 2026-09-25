import { customerEntitlementFundsFeature } from "@autumn/shared";
import type { Catalog } from "../../models/catalog/catalog.js";
import type { CatalogKey } from "../../models/catalog/catalogKey.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import {
	planLicensesToItemCatalogKeys,
	subjectStateToCatalogKeys,
	subjectStateToPlanLicenseCatalogKeys,
} from "../catalogUtils/convertCatalogUtils.js";

/**
 * The state and catalog a reply needs to answer for `featureIds`, and nothing
 * more: the rows that can fund those features (their own balances and any
 * credit system whose effective schema covers them), their rollovers and
 * replaceables, and the catalog rows those reference. Everything about the customer itself, its
 * products, prices, licenses and pools stays, since the caller reads those too.
 *
 * A check or track reply used to carry the customer's whole state, so its cost
 * scaled with how many features the customer held rather than with the one
 * being asked about.
 */
export const slimSubjectForFeatures = ({
	state,
	catalog,
	featureIds,
}: {
	state: SubjectState;
	catalog: Catalog;
	featureIds: string[];
}): { state: SubjectState; catalog: Catalog } => {
	const customerEntitlements = state.customerEntitlements.filter((row) => {
		const entitlement = catalog.entitlements[row.entitlement_id];
		const feature = catalog.features[row.internal_feature_id];
		// Without its catalog rows the row cannot be judged, so it is kept.
		if (!entitlement || !feature) return true;
		const customerEntitlement = { entitlement: { ...entitlement, feature } };
		return featureIds.some((featureId) =>
			customerEntitlementFundsFeature({ customerEntitlement, featureId }),
		);
	});
	const keptRowIds = new Set(customerEntitlements.map((row) => row.id));
	const slimState: SubjectState = {
		...state,
		customerEntitlements,
		rollovers: state.rollovers.filter((row) => keptRowIds.has(row.cus_ent_id)),
		replaceables: state.replaceables.filter((row) =>
			keptRowIds.has(row.cus_ent_id),
		),
	};
	return {
		state: slimState,
		catalog: catalogFor({ state: slimState, catalog }),
	};
};

/** The catalog rows `state` references, picked out of `catalog`. */
const catalogFor = ({
	state,
	catalog,
}: {
	state: SubjectState;
	catalog: Catalog;
}): Catalog => {
	const slim: Catalog = {
		entitlements: {},
		products: {},
		features: {},
		prices: {},
		planLicenses: {},
		freeTrials: {},
	};
	const pick = (key: CatalogKey) => {
		const row = catalog[key.table][key.id];
		if (row) slim[key.table][key.id] = row;
	};
	for (const key of subjectStateToCatalogKeys({ state })) pick(key);
	for (const key of subjectStateToPlanLicenseCatalogKeys({ state })) pick(key);
	for (const key of planLicensesToItemCatalogKeys({ catalog: slim })) pick(key);
	return slim;
};
