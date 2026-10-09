import type { CustomerProductCustomDiff } from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductCustomDiff";

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

const describeTermChanges = ({
	catalog,
	customer,
}: {
	catalog: unknown;
	customer: unknown;
}): string => {
	const catalogTerms = flattenTerms({ value: catalog });
	const customerTerms = flattenTerms({ value: customer });
	const paths = [...new Set([...catalogTerms.keys(), ...customerTerms.keys()])];

	return paths
		.filter((path) => catalogTerms.get(path) !== customerTerms.get(path))
		.sort()
		.map(
			(path) =>
				`${path} ${catalogTerms.get(path) ?? "unset"} → ${customerTerms.get(path) ?? "unset"}`,
		)
		.join(", ");
};

const describeTerms = ({ value }: { value: unknown }): string =>
	[...flattenTerms({ value }).entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, term]) => `${path} ${term}`)
		.join(", ");

const describeSide = ({
	label,
	catalog,
	customer,
}: {
	label: string;
	catalog: unknown;
	customer: unknown;
}): string => {
	if (catalog == null) return `${label}: added`;
	if (customer == null) return `${label}: removed`;
	return `${label}: ${describeTermChanges({ catalog, customer })}`;
};

export const customPlansDiffToChanges = ({
	diff,
}: {
	diff: CustomerProductCustomDiff;
}): string =>
	[
		...(diff.price
			? [
					describeSide({
						label: "base price",
						catalog: diff.price.catalog,
						customer: diff.price.customer,
					}),
				]
			: []),
		...(diff.items ?? []).map((item) =>
			describeSide({
				label: item.feature_id,
				catalog: item.catalog,
				customer: item.customer,
			}),
		),
		...(diff.upsert_licenses ?? []).map(
			({ license_plan_id, ...terms }) =>
				`license ${license_plan_id}: ${describeTerms({ value: terms })}`,
		),
		...(diff.remove_licenses ?? []).map(
			({ license_plan_id }) => `license ${license_plan_id}: removed`,
		),
	].join("; ");
