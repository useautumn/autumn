import { z } from "zod/v4";
import {
	type PlanItemFilter,
	PlanItemFilterSchema,
} from "../../../api/products/items/filter/planItemFilter.js";

const FilterablePlanItemSchema = z.object({
	feature_id: z.string().nullish(),
	included: z.number().nullish(),
	unlimited: z.boolean().nullish(),
	price: z
		.object({
			billing_method: z.string().nullish(),
			interval: z.string().nullish(),
			interval_count: z.number().nullish(),
		})
		.nullish(),
	reset: z
		.object({
			interval: z.string().nullish(),
			interval_count: z.number().nullish(),
		})
		.nullish(),
});

export type FilterablePlanItem = z.input<typeof FilterablePlanItemSchema>;

export const planItemMatchesFilter = ({
	item,
	filter,
}: {
	item: FilterablePlanItem;
	filter: PlanItemFilter;
}): boolean => {
	if (filter.feature_id !== undefined && item.feature_id !== filter.feature_id)
		return false;
	if (
		filter.billing_method !== undefined &&
		item.price?.billing_method !== filter.billing_method
	) {
		return false;
	}
	if (filter.interval !== undefined) {
		const itemInterval = item.price?.interval ?? item.reset?.interval;
		if (String(itemInterval) !== String(filter.interval)) return false;
	}
	if (filter.interval_count !== undefined) {
		const itemCount = item.price?.interval_count ?? item.reset?.interval_count;
		if ((itemCount ?? 1) !== filter.interval_count) return false;
	}
	if (filter.included !== undefined) {
		if (item.unlimited === true) return false;
		if ((item.included ?? 0) !== filter.included) return false;
	}
	return true;
};

export const loosePlanItemMatchesFilter = ({
	item,
	filter,
}: {
	item: unknown;
	filter: unknown;
}): boolean => {
	const parsedItem = FilterablePlanItemSchema.safeParse(item);
	const parsedFilter = PlanItemFilterSchema.safeParse(filter);
	return (
		parsedItem.success &&
		parsedFilter.success &&
		planItemMatchesFilter({ item: parsedItem.data, filter: parsedFilter.data })
	);
};
