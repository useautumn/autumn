import {
	type ApiFreeTrialV2,
	ApiFreeTrialV2Schema,
	type ApiPlanV1,
	ApiPlanV1Schema,
	billingControlsFromColumns,
	diffPlanV1,
	type Feature,
	type FullCustomer,
	type FullProduct,
	getProductItemDisplay,
	itemToBillingInterval,
	itemToBillingIntervalCount,
	productItemsToPlanItemsV1,
	productV2ToBasePrice,
	productV2ToFeatureItems,
	sortProductItems,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

import { ProductService } from "../../ProductService.js";
import { mapToProductItems } from "../../productV2Utils.js";
import { buildCustomerEligibility } from "./buildCustomerEligibility.js";

/**
 * Get free trial response in Plan V2 format
 */
const getFreeTrialV2Response = ({
	product,
}: {
	product: FullProduct;
}): ApiFreeTrialV2 | undefined => {
	if (!product.free_trial) return undefined;

	return ApiFreeTrialV2Schema.parse({
		duration_type: product.free_trial.duration,
		duration_length: product.free_trial.length,
		card_required: product.free_trial.card_required ?? false,
	});
};

/**
 * Convert FullProduct (DB format) to Plan API response format (V1/latest)
 */
export const getPlanResponse = async ({
	ctx,
	product,
	features,
	fullCus,
	expand = [],
	currency = "usd",
	baseFullProduct,
	resolveBaseFullProduct = true,
}: {
	ctx?: AutumnContext;
	product: FullProduct;
	features: Feature[];
	fullCus?: FullCustomer;
	expand?: string[];
	currency?: string;
	baseFullProduct?: FullProduct;
	resolveBaseFullProduct?: boolean;
}): Promise<ApiPlanV1> => {
	// 1. Convert prices/entitlements to items
	const rawItems = mapToProductItems({
		prices: product.prices,
		entitlements: product.entitlements,
		features: features,
	});

	// 2. Sort items
	const sortedItems = sortProductItems(rawItems, features);

	// 3. Create a ProductV2-like object for the helper
	const productV2 = { items: sortedItems };

	// 4. Extract base price using existing helper
	const basePriceItem = productV2ToBasePrice({ product: productV2 as any });
	const basePrice: ApiPlanV1["price"] | null = basePriceItem
		? {
				amount: basePriceItem.price,
				interval: itemToBillingInterval({ item: basePriceItem }),
				interval_count:
					itemToBillingIntervalCount({ item: basePriceItem }) !== 1
						? itemToBillingIntervalCount({ item: basePriceItem })
						: undefined,
				display: getProductItemDisplay({
					item: basePriceItem,
					features,
					currency,
				}),
			}
		: null;

	// 5. Get feature items only (no base price)
	const featureItems = productV2ToFeatureItems({
		items: sortedItems,
		withBasePrice: false, // Don't include base price in features
	});

	// 6. Convert items to plan features
	let planItems = productItemsToPlanItemsV1({
		items: featureItems,
		features,
		expand,
		currency,
	});

	planItems = planItems.map((item) => ({ ...item, proration: undefined }));

	// 7. Get free trial in V2 format
	const freeTrial = getFreeTrialV2Response({
		product,
	});

	// 8. Build customer eligibility
	const customerEligibility = await buildCustomerEligibility({
		ctx,
		fullCus,
		fullProduct: product,
	});

	// 9. Build Plan response
	const plan = {
		id: product.id,
		name: product.name || "",
		description: product.description || null,
		group: product.group || null,
		version: product.version,

		add_on: product.is_add_on ?? false,
		auto_enable: product.is_default ?? false,

		price: basePrice,
		items: planItems ?? [],
		licenses: product.licenses?.length
			? product.licenses.map((license) => ({
					license_plan_id: license.product.id,
					included: license.included,
					prepaid_only: license.prepaid_only,
				}))
			: undefined,
		free_trial: freeTrial,

		created_at: product.created_at,
		env: product.env,
		archived: product.archived,
		base_variant_id: product.base_variant_id,

		config: product.config ?? { ignore_past_due: false },
		billing_controls: billingControlsFromColumns(product),
		metadata: product.metadata ?? {},

		customer_eligibility: customerEligibility,
	} satisfies ApiPlanV1;

	const resolvedBaseFullProduct =
		baseFullProduct ??
		(resolveBaseFullProduct && ctx && product.base_internal_product_id
			? ((await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: product.base_internal_product_id,
					orgId: ctx.org.id,
					env: ctx.env,
					allowNotFound: true,
				})) ?? undefined)
			: undefined);
	const basePlan = resolvedBaseFullProduct
		? await getPlanResponse({
				ctx,
				product: resolvedBaseFullProduct,
				features,
				expand,
				currency,
			})
		: undefined;
	const customize = basePlan
		? diffPlanV1({ from: basePlan, to: plan })
		: undefined;
	const hasCustomize = customize && Object.keys(customize).length > 0;

	return ApiPlanV1Schema.parse({
		...plan,
		...(basePlan
			? {
					variant_details: {
						base_plan_id: basePlan.id,
						...(hasCustomize ? { customize } : {}),
					},
				}
			: {}),
	} satisfies ApiPlanV1);
};
