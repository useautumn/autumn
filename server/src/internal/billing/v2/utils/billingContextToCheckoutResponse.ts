import type { BillingContext, BillingPlan } from "@autumn/shared";
import {
	type CheckoutLineV0,
	type CheckoutResponseV0,
	CheckoutResponseV0Schema,
	orgToCurrency,
	toProductItem,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils";
import {
	getProductItemResponse,
	getProductResponse,
} from "@/internal/products/productUtils/productResponseUtils/getProductResponse";
import { notNullish } from "@/utils/genUtils";
import { billingPlanToNextCyclePreview } from "./billingPlan/billingPlanToNextCyclePreview";

export const billingContextToCheckoutResponse = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): Promise<CheckoutResponseV0> => {
	const { fullCustomer, fullProducts, featureQuantities } = billingContext;
	const { features, org } = ctx;
	const currency = orgToCurrency({ org });

	// 1. Get primary product (first non-add-on or first product)
	const mainProduct = fullProducts.find((p) => !p.is_add_on) ?? fullProducts[0];

	const product = mainProduct
		? await getProductResponse({
				product: mainProduct,
				features,
				fullCus: fullCustomer,
				currency,
				db: ctx.db,
				options: featureQuantities,
			})
		: null;

	// 2. Build line items from billing plan
	const planLineItems = billingPlan.autumn.lineItems ?? [];

	// Collect all prices and entitlements from products for lookup
	const allPrices = fullProducts.flatMap((p) => p.prices);
	const allEnts = fullProducts.flatMap((p) => p.entitlements);

	const lines: CheckoutLineV0[] = planLineItems
		.filter((line) => line.chargeImmediately)
		.map((line) => {
			const { price } = line.context;

			// Find entitlement for this price
			const ent = getPriceEntitlement(price, allEnts);

			// Build product item from price + entitlement
			const productItem = toProductItem({ ent, price });

			return {
				description: line.description,
				amount: line.amountAfterDiscounts,
				item: getProductItemResponse({
					item: productItem,
					features,
					currency,
					withDisplay: true,
					options: featureQuantities,
				}),
			};
		})
		.filter(notNullish);

	// 3. Calculate total
	const total = new Decimal(lines.reduce((acc, line) => acc + line.amount, 0))
		.toDecimalPlaces(2)
		.toNumber();

	// 4. Get next cycle preview
	const nextCycle = billingPlanToNextCyclePreview({
		ctx,
		billingContext,
		billingPlan,
	});

	// 5. Build options from feature quantities
	const options = featureQuantities
		.map((fq) => {
			const price = allPrices.find(
				(p) =>
					p.config &&
					"feature_id" in p.config &&
					(p.config.feature_id === fq.feature_id ||
						p.config.internal_feature_id === fq.internal_feature_id),
			);

			if (!price) return undefined;

			const billingUnits =
				price.config && "billing_units" in price.config
					? price.config.billing_units || 1
					: 1;

			return {
				feature_id: fq.feature_id,
				quantity: fq.quantity * billingUnits,
			};
		})
		.filter(notNullish);

	return CheckoutResponseV0Schema.parse({
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		product,
		current_product: null,
		lines,
		options,
		total,
		currency,
		next_cycle: nextCycle,
	});
};
