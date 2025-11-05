import {
	type AppEnv,
	type FullProduct,
	isOneOffPrice,
	isPriceItem,
	mapToProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getProductItemDisplay } from "@/internal/products/productUtils/productResponseUtils/getProductItemDisplay.js";
import { formatAmount } from "@/utils/formatUtils.js";
import type { VercelBillingPlan } from "../vercelTypes.js";

function productToBillingPlan({
	product,
	orgCurrency,
}: {
	product: FullProduct;
	orgCurrency: string;
}) {
	const hasRecurringPrice = product.prices.some(
		(x) => !isOneOffPrice({ price: x }),
	);

	const productV2 = mapToProductV2({ product });
	const basePrice = productV2ToBasePrice({ product: productV2 });

	const bp = {
		cost: basePrice?.amount
			? `${formatAmount({ amount: basePrice.amount, currency: orgCurrency ?? "usd" })}/${basePrice.interval}`
			: undefined,
		id: product.id,
		type: hasRecurringPrice ? "subscription" : "prepayment",
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
					value: d.secondary_text,
				};
			}),
		paymentMethodRequired: hasRecurringPrice,
		disabled: product.archived || false,
	} satisfies VercelBillingPlan;

	console.log("Vercel Billing Plan", bp);
	return bp;
}

export const handleListBillingPlans = createRoute({
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId } = c.req.param();
		const { db, org, features } = c.get("ctx");

		const products = await ProductService.listFull({
			db,
			orgId,
			env: env as AppEnv,
			archived: false,
		});

		const plans = products.map((product) =>
			productToBillingPlan({
				product,
				orgCurrency: org?.default_currency ?? "usd",
			}),
		);

		console.log(
			"Vercel GetBillingPlans requested",
			integrationConfigurationId,
			plans,
		);
		return c.json({ plans });
	},
});
