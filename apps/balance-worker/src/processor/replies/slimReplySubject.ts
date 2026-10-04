import {
	type Catalog,
	type SubjectState,
	slimSubjectForFeatures,
} from "@autumn/balance-engine";

/** What `slimSubjectForFeatures` read off a state, so a later state with the same layout reuses its answer. */
type SlimLayout = {
	customerProducts: SubjectState["customerProducts"];
	customerPrices: SubjectState["customerPrices"];
	customerLicenses: SubjectState["customerLicenses"];
	keptRowIndexes: number[];
	catalog: Catalog;
};

const LAYOUTS_PER_CATALOG = 64;

// Rows are picked by their catalog entitlement and feature, and the catalog by the tables kept by identity
// below, so a balance-only write (new row objects, same ids, same other tables) keeps the layout.
const layoutsByCatalog = new WeakMap<Catalog, Map<string, SlimLayout>>();

function layoutKeyOf({
	state,
	featureId,
}: {
	state: SubjectState;
	featureId: string;
}): string {
	let key = featureId;
	for (const row of state.customerEntitlements)
		key += `|${row.id}:${row.entitlement_id}:${row.internal_feature_id}`;
	return key;
}

function matchesLayout({
	layout,
	state,
}: {
	layout: SlimLayout;
	state: SubjectState;
}): boolean {
	return (
		layout.customerProducts === state.customerProducts &&
		layout.customerPrices === state.customerPrices &&
		layout.customerLicenses === state.customerLicenses
	);
}

function layoutOf({
	state,
	slim,
}: {
	state: SubjectState;
	slim: { state: SubjectState; catalog: Catalog };
}): SlimLayout {
	const kept = new Set(slim.state.customerEntitlements);
	const keptRowIndexes: number[] = [];
	for (const [index, row] of state.customerEntitlements.entries())
		if (kept.has(row)) keptRowIndexes.push(index);
	return {
		customerProducts: state.customerProducts,
		customerPrices: state.customerPrices,
		customerLicenses: state.customerLicenses,
		keptRowIndexes,
		catalog: slim.catalog,
	};
}

function remember({
	catalog,
	key,
	layout,
}: {
	catalog: Catalog;
	key: string;
	layout: SlimLayout;
}): void {
	let layouts = layoutsByCatalog.get(catalog);
	if (!layouts) {
		layouts = new Map();
		layoutsByCatalog.set(catalog, layouts);
	}
	if (layouts.size >= LAYOUTS_PER_CATALOG) {
		const oldest = layouts.keys().next().value;
		if (oldest !== undefined) layouts.delete(oldest);
	}
	layouts.set(key, layout);
}

function slimStateOf({
	state,
	keptRowIndexes,
}: {
	state: SubjectState;
	keptRowIndexes: number[];
}): SubjectState {
	const customerEntitlements = keptRowIndexes.map(
		(index) => state.customerEntitlements[index],
	) as SubjectState["customerEntitlements"];
	const keptRowIds = new Set(customerEntitlements.map((row) => row.id));
	return {
		...state,
		customerEntitlements,
		rollovers: state.rollovers.filter((row) => keptRowIds.has(row.cus_ent_id)),
		replaceables: state.replaceables.filter((row) =>
			keptRowIds.has(row.cus_ent_id),
		),
		openLocks: [],
	};
}

/** `slimSubjectForFeatures` for one feature, reusing the rows it picks and the catalog it slims while the layout holds. */
export function slimReplySubject({
	state,
	catalog,
	featureId,
}: {
	state: SubjectState;
	catalog: Catalog;
	featureId: string;
}): { state: SubjectState; catalog: Catalog } {
	const key = layoutKeyOf({ state, featureId });
	const known = layoutsByCatalog.get(catalog)?.get(key);
	if (known && matchesLayout({ layout: known, state }))
		return {
			state: slimStateOf({ state, keptRowIndexes: known.keptRowIndexes }),
			catalog: known.catalog,
		};
	const slim = slimSubjectForFeatures({
		state,
		catalog,
		featureIds: [featureId],
	});
	remember({ catalog, key, layout: layoutOf({ state, slim }) });
	return slim;
}
