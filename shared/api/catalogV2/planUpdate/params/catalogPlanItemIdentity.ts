export type CatalogItemIdentityRecipe = {
	responseField: string;
	components: readonly {
		paths: readonly string[];
		default: string | number;
		defaultWhen?: { component: number; value: string | number };
	}[];
};

export const catalogPlanItemIdentity = {
	responseField: "mapping_identity",
	components: [
		{ paths: ["feature_id"], default: "" },
		{ paths: ["price.billing_method"], default: "" },
		{ paths: ["price.interval", "reset.interval"], default: "" },
		{
			paths: ["price.interval_count", "reset.interval_count"],
			default: "",
			defaultWhen: { component: 2, value: 1 },
		},
	],
} as const satisfies CatalogItemIdentityRecipe;

export const evaluateCatalogItemIdentity = ({
	item,
	recipe = catalogPlanItemIdentity,
}: {
	item: object;
	recipe?: CatalogItemIdentityRecipe;
}): (string | number)[] => {
	const values: (string | number)[] = [];
	for (const component of recipe.components) {
		let value: unknown;
		for (const path of component.paths) {
			value = item;
			for (const key of path.split(".")) {
				value =
					value !== null && typeof value === "object"
						? (value as Record<string, unknown>)[key]
						: undefined;
			}
			if (value !== null && value !== undefined) break;
		}
		const fallback =
			component.defaultWhen && values[component.defaultWhen.component]
				? component.defaultWhen.value
				: component.default;
		if (
			value != null &&
			typeof value !== "string" &&
			typeof value !== "number"
		) {
			throw new Error("Catalog identity components must be strings or numbers");
		}
		values.push(value ?? fallback);
	}
	return values;
};
