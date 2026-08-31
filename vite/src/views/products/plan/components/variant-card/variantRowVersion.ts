import type { PlanVariant } from "@/services/products/ProductService";

export const variantRowVersion = (variant: PlanVariant) =>
	variant.product?.version ?? variant.latest_version;

export const groupVariantRowsByPlanId = (variants: PlanVariant[]) => {
	const byId = new Map<string, PlanVariant[]>();
	for (const variant of variants) {
		const rows = byId.get(variant.id) ?? [];
		rows.push(variant);
		byId.set(variant.id, rows);
	}

	return [...byId.values()]
		.map((rows) =>
			[...rows].sort(
				(left, right) => variantRowVersion(right) - variantRowVersion(left),
			),
		)
		.sort((left, right) => left[0].name.localeCompare(right[0].name));
};
