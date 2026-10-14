import type {
	Entitlement,
	Feature,
	FreeTrial,
	FullPlanLicense,
} from "@autumn/shared";
import type { Catalog } from "../../models/catalog/catalog.js";
import type { CatalogKey } from "../../models/catalog/catalogKey.js";
import type { CatalogRow } from "../../models/catalog/catalogRow.js";
import type { SubjectState } from "../../models/subject/subjectState.js";

export const catalogKeyToString = ({ key }: { key: CatalogKey }): string =>
	`${key.table}:${key.id}`;

export const catalogRowToCatalogKey = ({
	row,
}: {
	row: CatalogRow;
}): CatalogKey =>
	row.table === "products" || row.table === "features"
		? { table: row.table, id: row.row.internal_id }
		: { table: row.table, id: row.row.id };

const compareCatalogKeys = (left: CatalogKey, right: CatalogKey): number =>
	left.table.localeCompare(right.table) || left.id.localeCompare(right.id);

export const subjectStateToCatalogKeys = ({
	state,
}: {
	state: SubjectState;
}): CatalogKey[] => {
	const keysByString = new Map<string, CatalogKey>();
	const add = (key: CatalogKey) =>
		keysByString.set(catalogKeyToString({ key }), key);

	for (const customerProduct of state.customerProducts) {
		add({ table: "products", id: customerProduct.internal_product_id });
	}
	for (const customerPrice of state.customerPrices) {
		if (customerPrice.price_id)
			add({ table: "prices", id: customerPrice.price_id });
	}
	for (const customerEntitlement of state.customerEntitlements) {
		add({ table: "entitlements", id: customerEntitlement.entitlement_id });
		add({ table: "features", id: customerEntitlement.internal_feature_id });
	}

	return [...keysByString.values()].sort(compareCatalogKeys);
};

export const subjectStateToPlanLicenseCatalogKeys = ({
	state,
}: {
	state: SubjectState;
}): CatalogKey[] =>
	[
		...new Set(
			state.customerLicenses.flatMap(({ plan_license_id }) =>
				plan_license_id ? [plan_license_id] : [],
			),
		),
	]
		.sort()
		.map((id) => ({ table: "planLicenses", id }));

export const subjectStateToFreeTrialCatalogKeys = ({
	state,
}: {
	state: SubjectState;
}): CatalogKey[] =>
	[
		...new Set(
			state.customerProducts.flatMap(({ free_trial_id }) =>
				free_trial_id ? [free_trial_id] : [],
			),
		),
	]
		.sort()
		.map((id) => ({ table: "freeTrials", id }));

export const planLicensesToItemCatalogKeys = ({
	catalog,
}: {
	catalog: Catalog;
}): CatalogKey[] => {
	const keysByString = new Map<string, CatalogKey>();
	const add = (key: CatalogKey) =>
		keysByString.set(catalogKeyToString({ key }), key);

	for (const planLicense of Object.values(catalog.planLicenses)) {
		add({ table: "products", id: planLicense.license_internal_product_id });
		for (const id of planLicense.price_ids) add({ table: "prices", id });
		for (const id of planLicense.entitlement_ids)
			add({ table: "entitlements", id });
		for (const id of planLicense.internal_feature_ids)
			add({ table: "features", id });
	}

	return [...keysByString.values()].sort(compareCatalogKeys);
};

export const catalogRowsToCatalog = ({
	rows,
}: {
	rows: CatalogRow[];
}): Catalog => {
	const catalog: Catalog = {
		entitlements: {},
		products: {},
		features: {},
		prices: {},
		planLicenses: {},
		freeTrials: {},
	};
	for (const tagged of rows) {
		const { id } = catalogRowToCatalogKey({ row: tagged });
		switch (tagged.table) {
			case "entitlements":
				catalog.entitlements[id] = tagged.row;
				break;
			case "products":
				catalog.products[id] = tagged.row;
				break;
			case "features":
				catalog.features[id] = tagged.row;
				break;
			case "prices":
				catalog.prices[id] = tagged.row;
				break;
			case "planLicenses":
				catalog.planLicenses[id] = tagged.row;
				break;
			case "freeTrials":
				catalog.freeTrials[id] = tagged.row;
				break;
		}
	}
	return catalog;
};

export const mergeCatalogs = ({
	catalogs,
}: {
	catalogs: Catalog[];
}): Catalog => ({
	entitlements: Object.assign(
		{},
		...catalogs.map((catalog) => catalog.entitlements),
	),
	products: Object.assign({}, ...catalogs.map((catalog) => catalog.products)),
	features: Object.assign({}, ...catalogs.map((catalog) => catalog.features)),
	prices: Object.assign({}, ...catalogs.map((catalog) => catalog.prices)),
	planLicenses: Object.assign(
		{},
		...catalogs.map((catalog) => catalog.planLicenses),
	),
	freeTrials: Object.assign(
		{},
		...catalogs.map((catalog) => catalog.freeTrials),
	),
});

export const catalogToFreeTrial = ({
	catalog,
	freeTrialId,
}: {
	catalog: Catalog;
	freeTrialId: string | null | undefined;
}): FreeTrial | null => {
	const freeTrial = freeTrialId ? catalog.freeTrials[freeTrialId] : undefined;
	if (!freeTrial) return null;
	const { org_id: _orgId, env: _env, ...row } = freeTrial;
	return row;
};

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

export const catalogToFullPlanLicense = ({
	catalog,
	planLicenseId,
}: {
	catalog: Catalog;
	planLicenseId: string;
}): FullPlanLicense | null => {
	const planLicense = catalog.planLicenses[planLicenseId];
	if (!planLicense) return null;
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
