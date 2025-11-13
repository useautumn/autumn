import {
	type AppEnv,
	type FullProduct,
	isOneOffPrice,
	isPriceItem,
	mapToProductV2,
	type Organization,
	productV2ToBasePrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { parseVercelPrepaidQuantities } from "@/external/vercel/misc/vercelInvoicing.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { getProductItemDisplay } from "@/internal/products/productUtils/productResponseUtils/getProductItemDisplay.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { formatAmount } from "@/utils/formatUtils.js";
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
}) {
	const hasRecurringPrice = product.prices.some(
		(x) => !isOneOffPrice({ price: x }),
	);
	// const paymentMethodRequired = false;
	const productV2 = mapToProductV2({ product });
	const basePrice = productV2ToBasePrice({ product: productV2 });

	// Calculate prepaid costs from metadata
	let prepaidCosts = 0;
	if (metadata && Object.keys(metadata).length > 0) {
		prepaidCosts = calculatePrepaidCosts({ metadata, product });
	}

	// Total cost = base recurring + prepaid quantities
	const totalAmount = (basePrice?.amount || 0) + prepaidCosts;

	const bp = {
		cost:
			basePrice?.interval && totalAmount > 0
				? `${formatAmount({ amount: totalAmount, currency: orgCurrency ?? "usd" })}/${basePrice.interval}`
				: undefined,
		id: product.id,
		// type: hasRecurringPrice ? "subscription" : "prepayment",
		type: "subscription",
		name: product.name,
		scope: "installation",
		description: "",
		highlightedDetails: productV2.items
			.filter((x) => !isPriceItem(x))
			.map((x) => {
				const d = getProductItemDisplay({
					item: x,
					features: product.entitlements.map((e) => e.feature),
				});
				return {
					label: d.primary_text,
					value:
						d.secondary_text?.trim() !== ""
							? d.secondary_text?.trim()
							: undefined,
				};
			}),
		paymentMethodRequired: false,
		// paymentMethodRequired: totalAmount > 0,
		disabled: !!product.archived,
	} satisfies VercelBillingPlan;
	return bp;
}

export const listVercelPlansForOrg = async ({
	db,
	org,
	env,
	metadata,
	canCancel = true,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	metadata?: Record<string, any>;
	canCancel?: boolean;
}) => {
	const products = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		archived: false,
	});

	return [
		...products
			.filter(
				// Can't be an add-on, can't be archived, can't be one off
				// Can be default, can be usage-based, can be prepaid.
				// Can't have 0 entitlements, unless it's the default product.
				(p) =>
					!p.is_add_on &&
					!p.archived &&
					!isOneOff(p.prices) &&
					(p.entitlements.length > 0 || p.is_default),
			)
			.map((product) =>
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

export const handleListBillingPlansPerInstall = createRoute({
	query: z.object({
		metadata: z.string().optional(),
	}),
	handler: async (c) => {
		let { env, integrationConfigurationId, productId } = c.req.param() as {
			env: AppEnv;
			integrationConfigurationId?: string;
			productId?: string;
		};
		const { db, org, logger } = c.get("ctx");

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

		const customer = await CusService.getByVercelId({
			db,
			vercelInstallationId: integrationConfigurationId,
			orgId: org.id,
			env: env as AppEnv,
		});

		// Parse metadata from query params
		let metadata: Record<string, any> = {};
		const metadataParam = c.req.query("metadata");
		if (metadataParam) {
			try {
				metadata = JSON.parse(metadataParam);
			} catch (error: any) {
				logger.warn("Failed to parse metadata query param", {
					error: error.message,
					metadataParam,
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

		return c.json({ plans });
	},
});
