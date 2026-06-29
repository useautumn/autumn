import {
	AffectedResource,
	type ApiPlanV1,
	type CatalogGetMappingsParams,
	CatalogGetMappingsResponseSchema,
	type CatalogGetMappingsResponse,
	ProcessorType,
	applyResponseVersionChanges,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	type PriceConfigWithStripe,
	buildProductMappingContext,
	buildStripeMapping,
	productHasStripeProductId,
	stripeProductToCatalogProduct,
} from "./catalogMappingUtils.js";

const matchesStripeProductSearch = ({
	id,
	name,
	search,
}: {
	id: string;
	name: string | null;
	search?: string;
}) => {
	if (!search?.trim()) return true;
	const normalized = search.trim().toLowerCase();
	return (
		id.toLowerCase().includes(normalized) ||
		(name ?? "").toLowerCase().includes(normalized)
	);
};

const getStripeProducts = async ({
	ctx,
	params,
	mappedStripeProductIds,
}: {
	ctx: AutumnContext;
	params: CatalogGetMappingsParams;
	mappedStripeProductIds: string[];
}) => {
	const { org, env, logger } = ctx;
	const stripeConnected = isStripeConnected({ org, env });
	const stripeProductsById = new Map();

	if (!stripeConnected) {
		return { stripeConnected, stripeProductsById, stripeProducts: [] };
	}

	const stripeCli = createStripeCli({ org, env });

	try {
		const listedProducts = await stripeCli.products.list({ limit: 100 });
		for (const product of listedProducts.data) {
			const catalogProduct = stripeProductToCatalogProduct(product);
			stripeProductsById.set(catalogProduct.id, catalogProduct);
		}
	} catch (error) {
		logger.warn(`[catalog.get_mappings] Failed to list Stripe products: ${error}`);
	}

	for (const stripeProductId of mappedStripeProductIds) {
		if (stripeProductsById.has(stripeProductId)) continue;

		try {
			const product = await stripeCli.products.retrieve(stripeProductId);
			if ("deleted" in product && product.deleted) continue;
			const catalogProduct = stripeProductToCatalogProduct(product);
			stripeProductsById.set(catalogProduct.id, catalogProduct);
		} catch (error) {
			logger.warn(
				`[catalog.get_mappings] Stripe product ${stripeProductId} not found: ${error}`,
			);
		}
	}

	const stripeProducts = Array.from(stripeProductsById.values()).filter(
		(product) =>
			matchesStripeProductSearch({
				id: product.id,
				name: product.name,
				search: params.stripe_product_search,
			}),
	);

	return { stripeConnected, stripeProductsById, stripeProducts };
};

export const getCatalogMappings = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogGetMappingsParams;
}): Promise<CatalogGetMappingsResponse> => {
	const { db, org, env, features } = ctx;

	const products = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		archived: false,
	});

	const mappedStripeProductIds = [
		...new Set(
			products
				.flatMap((product) => [
					product.processor?.id,
					...product.prices.map(
						(price) =>
							(price.config as PriceConfigWithStripe).stripe_product_id,
					),
				])
				.filter((id): id is string => Boolean(id)),
		),
	];

	const { stripeConnected, stripeProductsById, stripeProducts } =
		await getStripeProducts({
			ctx,
			params,
			mappedStripeProductIds,
		});

	const mappedPlans = [];
	for (const product of products) {
		const plan = await getPlanResponse({
			ctx,
			product,
			features,
			currency: org.default_currency || undefined,
		});
		const responsePlan = applyResponseVersionChanges<ApiPlanV1>({
			input: plan,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Product,
			legacyData: { features },
			ctx,
		});
		const mappingContext = buildProductMappingContext({
			product,
			features,
			currency: org.default_currency || "usd",
		});

		mappedPlans.push({
			plan: responsePlan,
			plan_mapping: {
				plan_id: product.id,
				mapping: buildStripeMapping({
					stripeProductId:
						product.processor?.type === ProcessorType.Stripe
							? product.processor.id
							: null,
					stripeProductsById,
					stripeConnected,
				}),
			},
			item_mappings: mappingContext.itemPrices.map((entry) => ({
				plan_id: product.id,
				label: entry.label,
				item: entry.apiItem,
				item_filter: entry.itemFilter,
				mapping: buildStripeMapping({
					stripeProductId: (entry.price.config as PriceConfigWithStripe)
						.stripe_product_id,
					stripeProductsById,
					stripeConnected,
				}),
			})),
		});
	}

	const response = {
		processor_type: params.processor_type,
		stripe_connected: stripeConnected,
		stripe_products: stripeProducts.filter((stripeProduct) =>
			products.some((product) =>
				productHasStripeProductId({
					product,
					stripeProductId: stripeProduct.id,
				}),
			)
				? true
				: matchesStripeProductSearch({
						id: stripeProduct.id,
						name: stripeProduct.name,
						search: params.stripe_product_search,
					}),
		),
		plans: mappedPlans,
	};

	return CatalogGetMappingsResponseSchema.parse(response);
};
