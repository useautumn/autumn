import type {
	CustomDiffChange,
	CustomDiffField,
	CustomerProductCustomDiff,
} from "./types/customerProductCustomDiff";

type Terms = Map<string, string>;

/** Leaf values keyed by dotted path, so two snapshots compare field by field. */
const flattenTerms = ({
	value,
	prefix = "",
	terms = new Map(),
}: {
	value: unknown;
	prefix?: string;
	terms?: Terms;
}): Terms => {
	if (value === undefined) return terms;
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		terms.set(prefix, JSON.stringify(value));
		return terms;
	}
	for (const [key, child] of Object.entries(value)) {
		flattenTerms({
			value: child,
			prefix: prefix ? `${prefix}.${key}` : key,
			terms,
		});
	}
	return terms;
};

const changedFields = ({
	catalog,
	customer,
}: {
	catalog: unknown;
	customer: unknown;
}): CustomDiffField[] => {
	const catalogTerms: Terms =
		catalog == null ? new Map() : flattenTerms({ value: catalog });
	const customerTerms: Terms =
		customer == null ? new Map() : flattenTerms({ value: customer });
	const paths = [...new Set([...catalogTerms.keys(), ...customerTerms.keys()])];

	return paths
		.filter((path) => catalogTerms.get(path) !== customerTerms.get(path))
		.sort()
		.map((path) => ({
			path,
			catalog: catalogTerms.get(path) ?? null,
			customer: customerTerms.get(path) ?? null,
		}));
};

const sideChange = ({
	target,
	id,
	catalog,
	customer,
}: {
	target: CustomDiffChange["target"];
	id: string | null;
	catalog: unknown;
	customer: unknown;
}): CustomDiffChange => {
	if (catalog == null)
		return {
			target,
			id,
			kind: "added",
			fields: changedFields({ catalog: null, customer }),
		};
	if (customer == null)
		return {
			target,
			id,
			kind: "removed",
			fields: changedFields({ catalog, customer: null }),
		};
	return {
		target,
		id,
		kind: "changed",
		fields: changedFields({ catalog, customer }),
	};
};

/** One entry per difference, in a stable order: base price, items, then licenses. */
export const customDiffToChanges = ({
	diff,
}: {
	diff: CustomerProductCustomDiff;
}): CustomDiffChange[] => [
	...(diff.price
		? [
				sideChange({
					target: "base_price",
					id: null,
					catalog: diff.price.catalog,
					customer: diff.price.customer,
				}),
			]
		: []),
	...(diff.items ?? []).map((item) =>
		sideChange({
			target: "item",
			id: item.feature_id,
			catalog: item.catalog,
			customer: item.customer,
		}),
	),
	...(diff.upsert_licenses ?? []).map(
		({ license_plan_id, ...terms }): CustomDiffChange => ({
			target: "license",
			id: license_plan_id,
			kind: "changed",
			fields: changedFields({ catalog: null, customer: terms }),
		}),
	),
	...(diff.remove_licenses ?? []).map(
		({ license_plan_id }): CustomDiffChange => ({
			target: "license",
			id: license_plan_id,
			kind: "removed",
			fields: [],
		}),
	),
];
