import type { Catalog } from "@autumn/balance-engine";
import type { Entitlement, Feature, FullPlanLicense } from "@autumn/shared";

/** Every row the ids name, or null when the catalog lacks any of them. */
const allRowsOf = <Row>({
	ids,
	rowsById,
}: {
	ids: string[];
	rowsById: Record<string, Row>;
}): Row[] | null => {
	const rows = ids.flatMap((id) => (id in rowsById ? [rowsById[id]] : []));
	return rows.length === ids.length ? rows : null;
};

const withFeatures = ({
	entitlements,
	features,
}: {
	entitlements: Entitlement[];
	features: Record<string, Feature>;
}): (Entitlement & { feature: Feature })[] | null => {
	const withFeature = entitlements.flatMap((entitlement) => {
		const feature = features[entitlement.internal_feature_id];
		return feature ? [{ ...entitlement, feature }] : [];
	});
	return withFeature.length === entitlements.length ? withFeature : null;
};

/** A pool's definition from the worker's catalog; null when the link is gone or any row it is made of is missing. */
export const catalogToFullPlanLicense = ({
	catalog,
	planLicenseId,
}: {
	catalog: Catalog;
	planLicenseId: string;
}): FullPlanLicense | null => {
	const planLicense = catalog.planLicenses[planLicenseId];
	if (!planLicense) return null;
	// The id lists are catalog plumbing, not plan license columns.
	const {
		price_ids,
		entitlement_ids,
		internal_feature_ids: _internalFeatureIds,
		org_id: _orgId,
		env: _env,
		...row
	} = planLicense;

	const product = catalog.products[planLicense.license_internal_product_id];
	const prices = allRowsOf({ ids: price_ids, rowsById: catalog.prices });
	const entitlements = allRowsOf({
		ids: entitlement_ids,
		rowsById: catalog.entitlements,
	});
	if (!product || !prices || !entitlements) return null;
	const entitlementsWithFeatures = withFeatures({
		entitlements,
		features: catalog.features,
	});
	if (!entitlementsWithFeatures) return null;

	return {
		...row,
		product: {
			...product,
			prices,
			entitlements: entitlementsWithFeatures,
			free_trial: null,
		},
	} satisfies FullPlanLicense;
};
