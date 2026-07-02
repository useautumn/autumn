import {
	AppEnv,
	type AutumnBillingPlan,
	type BillingContext,
	billingContextToCurrency,
	copyStripeResourcesToMatchingPrice,
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
import { PriceService } from "@/internal/products/prices/PriceService";
import { checkStripeProductExists } from "@/internal/products/productUtils";

export const initStripeResourcesForProducts = async ({
	ctx,
	products,
	internalEntityId,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
	internalEntityId?: string;
}) => {
	const { db, org, env, logger } = ctx;
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

const applyStripeReuseWithinProduct = async ({
	db,
	product,
}: {
	db: AutumnContext["db"];
	product: FullProduct;
}) => {
	for (const targetPrice of product.prices) {
		const candidatePrices = product.prices.filter(
			(price) => price.id !== targetPrice.id,
		);
		if (candidatePrices.length === 0) continue;

		const { copiedFields } = copyStripeResourcesToMatchingPrice({
			targetPrice,
			candidatePrices,
			targetEntitlements: product.entitlements,
			candidateEntitlements: product.entitlements,
		});

		if (copiedFields.length === 0) continue;

		await PriceService.update({
			db,
			id: targetPrice.id,
			update: { config: targetPrice.config },
		});
	}
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

	if (billingContext.dryRunStripe) {
		applyPreviewStripeResourcesToBillingPlan({
			autumnBillingPlan,
			billingContext,
		});
		return;
	}

	if (orgDisableStripeWrites({ ctx })) return;

	const { fullCustomer } = billingContext;
	const { insertCustomerProducts } = autumnBillingPlan;
	const patchCustomerProducts = getPatchCustomerProducts({ autumnBillingPlan });

	const currency = billingContextToCurrency({ org, billingContext });
	const orgDefault = orgToCurrency({ org }).toLowerCase();

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

	const allProducts = [...newProducts, ...patchProducts, ...existingProducts];
	const internalEntityId = fullCustomer.entity?.internal_id;

	await Promise.all(
		allProducts.map((product) =>
			applyStripeReuseWithinProduct({ db, product }),
		),
	);

	const batchProductUpdates = [];
	for (const product of allProducts) {
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

	for (const product of allProducts) {
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
