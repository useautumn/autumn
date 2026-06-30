import {
	type CatalogUpdateMappingsParams,
	ErrCode,
	type FullProduct,
	type Price,
	RecaseError,
} from "@autumn/shared";

export type PriceTarget = {
	price: Price;
	product: FullProduct;
	stripeProductId: string | null;
	source: "plan" | "item";
	resetStripeResources?: boolean;
	matchExistingStripePrice?: boolean;
};

export type PriceTargets = Map<string, PriceTarget>;

export const normalizeStripeProductId = (stripeProductId: string | null) =>
	stripeProductId?.trim() ? stripeProductId.trim() : null;

export const getCatalogMappingPlanIds = (
	params: CatalogUpdateMappingsParams,
) => [...new Set(params.plan_mappings.map((mapping) => mapping.plan_id))];

export const assertUniquePlanMappings = ({
	params,
}: {
	params: CatalogUpdateMappingsParams;
}) => {
	const seen = new Map<string, string>();

	for (const mapping of params.plan_mappings) {
		const signature = JSON.stringify({
			stripe_product_id: normalizeStripeProductId(mapping.stripe_product_id),
			scope: mapping.scope,
			item_mappings: mapping.item_mappings.map((itemMapping) => ({
				filter: itemMapping.filter,
				stripe_product_id: normalizeStripeProductId(
					itemMapping.stripe_product_id,
				),
			})),
		});
		const existing = seen.get(mapping.plan_id);
		if (existing && existing !== signature) {
			throw new RecaseError({
				message: `Conflicting plan mappings for ${mapping.plan_id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		seen.set(mapping.plan_id, signature);
	}
};

export const setPriceTarget = ({
	targets,
	price,
	product,
	priceId,
	stripeProductId,
	source,
	resetStripeResources = false,
	matchExistingStripePrice = false,
}: {
	targets: PriceTargets;
	price: Price;
	product: FullProduct;
	priceId: string;
	stripeProductId: string | null;
	source: PriceTarget["source"];
	resetStripeResources?: boolean;
	matchExistingStripePrice?: boolean;
}) => {
	const existing = targets.get(priceId);
	if (!existing) {
		targets.set(priceId, {
			price,
			product,
			stripeProductId,
			source,
			resetStripeResources,
			matchExistingStripePrice,
		});
		return;
	}

	if (existing.stripeProductId === stripeProductId) {
		targets.set(priceId, {
			...existing,
			product,
			resetStripeResources:
				existing.resetStripeResources || resetStripeResources,
			matchExistingStripePrice:
				existing.matchExistingStripePrice || matchExistingStripePrice,
		});
		return;
	}
	if (existing.source === "plan" && source === "item") {
		targets.set(priceId, {
			price,
			product,
			stripeProductId,
			source,
			resetStripeResources,
			matchExistingStripePrice,
		});
		return;
	}

	throw new RecaseError({
		message: `Conflicting item mappings target the same price`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
