import {
	AffectedResource,
	APICusProductSchema,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	CusProductStatus,
	type Feature,
	type FullCusProduct,
	LATEST_VERSION,
	type Subscription,
} from "@autumn/shared";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { fullCusProductToProduct } from "../../cusProducts/cusProductUtils.js";

/**
 * Builds a customer product in LATEST format, then applies version changes
 *
 * Latest format (V1_1+):
 * - Has `items` field with product features
 * - Has `started_at` instead of `starts_at`
 * - Includes current_period_start/end for trials
 */
export const getApiCusProduct = async ({
	cusProduct,
	subs,
	features,
	apiVersion,
	entity,
}: {
	cusProduct: FullCusProduct;
	subs?: Subscription[];
	features: Feature[];
	apiVersion: ApiVersion;
	entity?: any;
}): Promise<any> => {
	// Determine if trialing
	const trialing =
		cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();

	// Build stripe subscription data
	const subIds = cusProduct.subscription_ids;
	let stripeSubData = {};

	if ((!subIds || subIds.length === 0) && trialing) {
		stripeSubData = {
			current_period_start: cusProduct.starts_at,
			current_period_end: cusProduct.trial_ends_at,
		};
	} else if (subIds && subIds.length > 0 && subs) {
		const baseSub = subs.find(
			(s) => s.id === subIds[0] || (s as Subscription).stripe_id === subIds[0],
		);
		if (baseSub) {
			stripeSubData = {
				current_period_end: baseSub.current_period_end
					? baseSub.current_period_end * 1000
					: null,
				current_period_start: baseSub.current_period_start
					? baseSub.current_period_start * 1000
					: null,
			};
		}
	}

	// Build product in LATEST format (V1_1+)
	const fullProduct = fullCusProductToProduct(cusProduct);
	const v2Product = await getProductResponse({
		product: fullProduct,
		features,
		withDisplay: false,
		options: cusProduct.options,
	});

	const latestProduct = APICusProductSchema.parse({
		id: fullProduct.id,
		name: fullProduct.name,
		group: fullProduct.group || null,
		status: trialing ? CusProductStatus.Trialing : cusProduct.status,
		canceled_at: cusProduct.canceled_at || null,
		is_default: fullProduct.is_default || false,
		is_add_on: fullProduct.is_add_on || false,
		version: fullProduct.version,
		quantity: cusProduct.quantity,
		started_at: cusProduct.starts_at,
		entity_id: entity?.id || cusProduct.entity_id || undefined,
		...stripeSubData,
		items: v2Product.items, // V1_1+ has items field
	});

	// Apply version changes to transform to requested version
	// This will remove items field for V0_1
	return applyResponseVersionChanges({
		input: latestProduct,
		currentVersion: new ApiVersionClass(LATEST_VERSION),
		targetVersion: new ApiVersionClass(apiVersion),
		resource: AffectedResource.CusProduct,
	});
};
