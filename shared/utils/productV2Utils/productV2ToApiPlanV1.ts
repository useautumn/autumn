import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import type { ProductV2 } from "@models/productV2Models/productV2Models.js";
import { sortProductItems } from "@utils/productDisplayUtils/sortProductItems.js";
import { getProductItemDisplay } from "@utils/productDisplayUtils.js";
import { productItemsToPlanItemsV1 } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemV1.js";
import {
	itemToBillingInterval,
	itemToBillingIntervalCount,
} from "@utils/productV2Utils/productItemUtils/itemIntervalUtils.js";
import {
	productV2ToBasePrice,
	productV2ToFeatureItems,
} from "@utils/productV3Utils/productItemUtils/productV3ItemUtils.js";

/**
 * Convert a ProductV2 (items-based) into the latest plan API response shape.
 * Shared by the persisted plan response, the catalog preview (params resolved
 * with no DB write), and the migration-draft builder. Pure: callers fill any
 * DB-only meta (version/env/created_at) on the ProductV2 before calling.
 * `currency` enables display strings; omit it for diff-only callers.
 */
export const productV2ToApiPlanV1 = ({
	product,
	features,
	currency,
	customerEligibility,
}: {
	product: ProductV2;
	features: Feature[];
	currency?: string;
	customerEligibility?: ApiPlanV1["customer_eligibility"];
}): ApiPlanV1 => {
	const sortedItems = sortProductItems(product.items, features);

	const basePriceItem = productV2ToBasePrice({
		product: { ...product, items: sortedItems },
	});
	const basePrice: ApiPlanV1["price"] = basePriceItem
		? {
				amount: basePriceItem.price,
				...(basePriceItem.additional_currencies?.length
					? { additional_currencies: basePriceItem.additional_currencies }
					: {}),
				interval: itemToBillingInterval({ item: basePriceItem }),
				...(itemToBillingIntervalCount({ item: basePriceItem }) !== 1
					? {
							interval_count: itemToBillingIntervalCount({
								item: basePriceItem,
							}),
						}
					: {}),
				...(currency
					? {
							display: getProductItemDisplay({
								item: basePriceItem,
								features,
								currency,
							}),
						}
					: {}),
			}
		: null;

	const featureItems = productV2ToFeatureItems({
		items: sortedItems,
		withBasePrice: false,
	});

	const planItems = productItemsToPlanItemsV1({
		items: featureItems,
		features,
		currency,
	}).map((item) => ({ ...item, proration: undefined }));

	const freeTrial: ApiPlanV1["free_trial"] = product.free_trial
		? {
				duration_type: product.free_trial.duration,
				duration_length: product.free_trial.length,
				card_required: product.free_trial.card_required ?? false,
				...(product.free_trial.on_end
					? { on_end: product.free_trial.on_end }
					: {}),
			}
		: undefined;

	return ApiPlanV1Schema.parse({
		id: product.id,
		name: product.name || "",
		description: product.description || null,
		group: product.group || null,
		version: product.version ?? 1,
		add_on: product.is_add_on ?? false,
		auto_enable: product.is_default ?? false,
		price: basePrice,
		items: planItems,
		free_trial: freeTrial,
		created_at: product.created_at ?? Date.now(),
		env: product.env,
		archived: product.archived ?? false,
		base_variant_id: null,
		config: {
			...product.config,
			ignore_past_due: product.config?.ignore_past_due ?? false,
		},
		metadata: product.metadata ?? {},
		customer_eligibility: customerEligibility,
	} satisfies ApiPlanV1);
};
