import {
	AppEnv,
	type FullProduct,
	formatAmount,
	getProductItemDisplay,
	isFixedPrice,
	isPrepaidPrice,
	isPriceItem,
	mapToProductV2,
	type Organization,
	productV2ToBasePrice,
	Scopes,
	type UsagePriceConfig,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { parseVercelPrepaidQuantities } from "@/external/vercel/misc/vercelInvoicing.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import { sortProductsByPrice } from "../../../internal/products/productUtils/sortProductUtils.js";
import {
	isFreeProduct,
	isOneOff,
} from "../../../internal/products/productUtils.js";
import type { VercelBillingPlan } from "../misc/vercelTypes.js";

/**
 * Calculate total cost of prepaid quantities from metadata
 */
function calculatePrepaidCosts({
	metadata,
	product,
}: {
	metadata: Record<string, any>;
	product: FullProduct;
}): number {
	if (!metadata || Object.keys(metadata).length === 0) {
		return 0;
	}

	let totalPrepaidCost = 0;

	// Parse prepaid quantities using existing validation logic
	const optionsList = parseVercelPrepaidQuantities({
		metadata,
		product,
		prices: product.prices,
	});

	// Calculate cost for each prepaid feature
	for (const options of optionsList) {
		const prepaidPrice = findPrepaidPrice({
			prices: product.prices,
			internalFeatureId: options.internal_feature_id ?? "",
		});

		if (prepaidPrice) {
			const config = prepaidPrice.config as UsagePriceConfig;
			const billingUnits = config.billing_units || 1;

			// Calculate quantity in subscription items (metadata quantity / billing_units, rounded up)
			const subscriptionItemQuantity = Math.ceil(
				options.quantity / billingUnits,
			);

			// Get unit price from first usage tier
			const unitAmount = config.usage_tiers[0]?.amount || 0;

			// Calculate total cost for this feature
			const featureCost = subscriptionItemQuantity * unitAmount;
			totalPrepaidCost += featureCost;
		}
	}

	return totalPrepaidCost;
}

export function productToBillingPlan({
	product,
	orgCurrency,
	metadata = {},
}: {
	product: FullProduct;
	orgCurrency: string;
	metadata?: Record<string, any>;
}): VercelBillingPlan {
	// const paymentMethodRequired = false;
	const productV2 = mapToProductV2({ product });
	const basePrice = productV2ToBasePrice({ product: productV2 });

	// Calculate prepaid costs from metadata
	let prepaidCosts = 0;
	if (metadata && Object.keys(metadata).length > 0) {
		prepaidCosts = calculatePrepaidCosts({ metadata, product });
	}

	// Total cost = base recurring + prepaid quantities
	const totalAmount = (basePrice?.price || 0) + prepaidCosts;

	const highlightedDetails = productV2.items
		.filter((x) => !isPriceItem(x))
		.map((x) => {
			const d = getProductItemDisplay({
				item: x,
				features: product.entitlements.map((e) => e.feature),
				// fullDisplay: true,
			});

			return {
				label: d.primary_text,
				value:
					d.secondary_text?.trim() !== ""
						? d.secondary_text?.trim()
						: undefined,
			};
		});

	const bp = {
		cost:
			basePrice?.interval && totalAmount > 0
				? `${formatAmount({ amount: totalAmount, currency: orgCurrency ?? "usd" })}/${basePrice.interval}`
				: undefined,
		id: product.id,
		type: "subscription",
		name: product.name,
		scope: "installation",
		description: "",
		highlightedDetails,
		paymentMethodRequired: totalAmount > 0,
		...(totalAmount > 0 && { preauthorizationAmount: totalAmount }),
		disabled: !!product.archived,
	} satisfies VercelBillingPlan;
	return bp;
}

const getVercelPlanFilterReason = ({ product }: { product: FullProduct }) => {
	if (
		product.prices.some(
			(price) => !isFixedPrice(price) && !isPrepaidPrice(price),
		)
	) {
		return "Has usage prices";
	}

	if (product.is_add_on) return "Is add-on";
	if (isOneOff(product.prices) && !isFreeProduct(product.prices)) {
		return "Is paid one-off";
	}
	if (product.archived) return "Is archived";
	if (product.entitlements.length === 0 && !product.is_default) {
		return "Has no entitlements and is not default";
	}

	return null;
};

const listVercelPlansForOrg = async ({
	db,
	org,
	env,
	metadata,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be useful in the future
	canCancel = true,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	metadata?: Record<string, any>;
	canCancel?: boolean;
}) => {
	const allowedIds =
		(env === AppEnv.Live
			? org.processor_configs?.vercel?.allowed_product_ids_live
			: org.processor_configs?.vercel?.allowed_product_ids_sandbox) ?? [];

	const products = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		archived: false,
		inIds: allowedIds.length > 0 ? allowedIds : undefined,
	});

	sortProductsByPrice({ products });
	console.log(
		"Products before filtering",
		products.map((p) => p.name),
	);
	// 1. Get rid of products that have usage prices
	// 2. Get rid of products that are archived
	// 3. Get rid of products that are one off, only if they are not free
	const filteredProducts = products.filter(
		(product) => !getVercelPlanFilterReason({ product }),
	);

	console.log(
		"Products after filtering",
		filteredProducts.map((p) => p.name),
	);
	console.log(
		"For each product, here is the reason it was filtered out",
		products
			.map((product) => ({
				name: product.name,
				reason: getVercelPlanFilterReason({ product }),
			}))
			.filter(({ reason }) => reason),
	);

	return [
		...filteredProducts.map((product) =>
			productToBillingPlan({
				product,
				orgCurrency: org?.default_currency ?? "usd",
				metadata,
			}),
		),
		// ...((canCancel
		// 	? [
		// 			{
		// 				id: "cancel_plan",
		// 				type: "subscription",
		// 				name: "Cancel plan",
		// 				description:
		// 					"Select this to immediately cancel your subscription and lose access.",
		// 				cost: undefined,
		// 				highlightedDetails: [],
		// 				disabled: false,
		// 			},
		// 		]
		// 	: []) as VercelBillingPlan[]),
	] satisfies VercelBillingPlan[];
};

export const handleVercelListBillingPlans = createRoute({
	scopes: [Scopes.Public],
	query: z.object({
		metadata: z.string().optional(),
	}),
	handler: async (c) => {
		let { env, integrationConfigurationId, productId } = c.req.param() as {
			env: AppEnv;
			integrationConfigurationId?: string;
			productId?: string;
		};
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;

		if (!integrationConfigurationId && !productId) {
			return c.json(
				{
					error: "Missing integration configuration ID or product ID",
				},
				400,
			);
		}

		if (productId && !integrationConfigurationId) {
			const claims = c.get("vercelClaims");
			if (!claims) {
				return c.json(
					{
						error: "Missing installation ID",
					},
					400,
				);
			}
			integrationConfigurationId = claims.installation_id ?? "";
		}

		if (!integrationConfigurationId) {
			return c.json(
				{
					error: "Missing installation ID",
				},
				400,
			);
		}

		const { fullCustomer: customer } = ctx;

		// Parse metadata from query params
		let metadata: Record<string, any> = {};
		const metadataParam = c.req.query("metadata");
		if (metadataParam) {
			try {
				metadata = JSON.parse(metadataParam);
			} catch (error: any) {
				logCaughtError({
					logger,
					message: "[vercel/plans.list] Failed to parse metadata query param",
					error,
					data: { metadataParam },
					level: "warn",
				});
			}
		}

		const plans = await listVercelPlansForOrg({
			db,
			org,
			env,
			metadata,
			canCancel:
				customer?.customer_products?.length === 0 ||
				customer?.customer_products?.every((p) => !p?.product?.is_default),
		});

		console.log("plans", plans);

		return c.json({ plans });
	},
});
