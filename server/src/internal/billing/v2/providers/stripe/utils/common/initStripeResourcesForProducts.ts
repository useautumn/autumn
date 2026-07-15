import {
	AppEnv,
	type AutumnBillingPlan,
	type BillingContext,
	billingContextToCurrency,
	cusProductToProduct,
	type FullProduct,
	getPriceCurrencyStripeId,
	isFixedPrice,
	isFreeProduct,
	isPrepaidPrice,
	nullish,
	orgToCurrency,
	type Price,
} from "@autumn/shared";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import { applyPreviewStripeResourcesToBillingPlan } from "@/external/stripe/previewStripeResourceIds";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	applyCustomerProductPatch,
	getPatchCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { orgDisableStripeWrites } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { checkStripeProductExists } from "@/internal/products/productUtils";
import { applyStripeResourceReuseForProduct } from "@/internal/products/stripeResourceUtils/applyStripeResourceReuseForProduct";
import { applyStripeReuseFromVariantFamilies } from "@/internal/products/stripeResourceUtils/applyStripeReuseFromVariantFamilies";

export const initStripeResourcesForProducts = async ({
	ctx,
	products,
	candidateProducts = [],
	internalEntityId,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
	candidateProducts?: FullProduct[];
	internalEntityId?: string;
}) => {
	const { db, org, env, logger } = ctx;

	await Promise.all(
		products.map((product) =>
			applyStripeResourceReuseForProduct({ ctx, product, candidateProducts }),
		),
	);
	await applyStripeReuseFromVariantFamilies({ ctx, products });

	if (env === AppEnv.Live) return;
	if (orgDisableStripeWrites({ ctx, includeSandbox: true })) return;

	const batchProductUpdates = [];
	for (const product of products) {
		if (product.processor?.id != null) continue;

		batchProductUpdates.push(
			checkStripeProductExists({
				db,
				org,
				env,
				product,
				logger,
			}),
		);
	}
	await Promise.all(batchProductUpdates);

	const batchPriceUpdates = [];

	for (const product of products) {
		for (const price of product.prices) {
			batchPriceUpdates.push(
				createStripePriceIFNotExist({
					ctx,
					price,
					entitlements: product.entitlements,
					product,
					internalEntityId,
					useCheckout: false,
				}),
			);
		}
	}
	await Promise.all(batchPriceUpdates);
};

const shouldInitializeStripePrice = ({ price }: { price: Price }) => {
	if (!isFixedPrice(price)) return true;

	return (price.config.amount ?? 0) > 0;
};

export const initStripeResourcesForBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
}) => {
	const { db, org, env, logger } = ctx;

	const currency = billingContextToCurrency({ org, billingContext });
	const orgDefault = orgToCurrency({ org }).toLowerCase();

	if (billingContext.dryRunStripe) {
		applyPreviewStripeResourcesToBillingPlan({
			autumnBillingPlan,
			billingContext,
			currency,
			orgDefault,
		});
		return;
	}

	const { fullCustomer } = billingContext;
	const { insertCustomerProducts } = autumnBillingPlan;
	const patchCustomerProducts = getPatchCustomerProducts({ autumnBillingPlan });

	const newProducts = insertCustomerProducts.flatMap((customerProduct) =>
		cusProductToProduct({ cusProduct: customerProduct }),
	);

	const patchProducts = patchCustomerProducts.map((patchCustomerProduct) =>
		cusProductToProduct({
			cusProduct: applyCustomerProductPatch({
				customerProduct: patchCustomerProduct.customerProduct,
				patch: patchCustomerProduct,
			}),
		}),
	);
	const patchedCustomerProductIds = new Set(
		patchCustomerProducts.map(
			(patchCustomerProduct) => patchCustomerProduct.customerProduct.id,
		),
	);

	const existingProducts = fullCustomer.customer_products
		.filter(
			(customerProduct) => !patchedCustomerProductIds.has(customerProduct.id),
		)
		.map((customerProduct) =>
			cusProductToProduct({ cusProduct: customerProduct }),
		)
		.map((product) => ({
			...product,
			prices: product.prices.filter(
				(price) =>
					shouldInitializeStripePrice({ price }) &&
					(nullish(
						getPriceCurrencyStripeId({
							config: price.config,
							currency,
							orgDefault,
							slot: "stripe_price_id",
						}),
					) ||
						(isPrepaidPrice(price) &&
							nullish(
								getPriceCurrencyStripeId({
									config: price.config,
									currency,
									orgDefault,
									slot: "stripe_prepaid_price_v2_id",
								}),
							))),
			),
		}))
		.filter(
			(product) => nullish(product.processor?.id) || product.prices.length > 0,
		);

	// License child products bill through their parents, so their prices need
	// Stripe resources too. Price objects are shared refs — init mutates them.
	const licenseProductsByInternalId = new Map<string, FullProduct>();
	for (const customerProduct of [
		...insertCustomerProducts,
		...fullCustomer.customer_products,
	]) {
		for (const customerLicense of customerProduct.customer_licenses ?? []) {
			const licenseProduct = customerLicense.planLicense?.product;
			if (!licenseProduct) continue;
			licenseProductsByInternalId.set(
				licenseProduct.internal_id,
				licenseProduct,
			);
		}
	}
	const licenseProducts = Array.from(licenseProductsByInternalId.values());

	const targetProducts = [
		...newProducts,
		...patchProducts,
		...existingProducts,
		...licenseProducts,
	];
	const internalEntityId = fullCustomer.entity?.internal_id;

	await Promise.all(
		targetProducts.map((product) =>
			applyStripeResourceReuseForProduct({ ctx, product }),
		),
	);
	await applyStripeReuseFromVariantFamilies({ ctx, products: targetProducts });

	if (orgDisableStripeWrites({ ctx })) return;

	const batchProductUpdates = [];
	for (const product of targetProducts) {
		if (product.processor?.id != null) continue;
		if (isFreeProduct({ prices: product.prices })) continue;

		batchProductUpdates.push(
			checkStripeProductExists({
				db,
				org,
				env,
				product,
				logger,
			}),
		);
	}
	await Promise.all(batchProductUpdates);

	const batchPriceUpdates = [];

	for (const product of targetProducts) {
		for (const price of product.prices) {
			if (!shouldInitializeStripePrice({ price })) continue;

			batchPriceUpdates.push(
				createStripePriceIFNotExist({
					ctx,
					price,
					entitlements: product.entitlements,
					product,
					internalEntityId,
					useCheckout: false,
					currency,
				}),
			);
		}
	}
	await Promise.all(batchPriceUpdates);
};
