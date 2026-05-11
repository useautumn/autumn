import {
	type AutumnBillingPlan,
	type BillingContext,
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	findCustomerProductById,
	isFixedPrice,
	isPrepaidPrice,
	nullish,
	type Price,
} from "@autumn/shared";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import { applyPreviewStripeResourcesToProduct } from "@/external/stripe/previewStripeResourceIds";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	applyCustomerProductPatch,
	getPatchCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { checkStripeProductExists } from "@/internal/products/productUtils";

const shouldInitializeStripePrice = ({ price }: { price: Price }) => {
	if (!isFixedPrice(price)) return true;

	return (price.config.amount ?? 0) > 0;
};

const productNeedsPlanStripeProduct = ({ product }: { product: FullProduct }) =>
	product.prices.some(
		(price) => isFixedPrice(price) && shouldInitializeStripePrice({ price }),
	);

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
					(nullish(price.config.stripe_price_id) ||
						(isPrepaidPrice(price) &&
							nullish(price.config.stripe_prepaid_price_v2_id))),
			),
		}))
		.filter(
			(product) => nullish(product.processor?.id) || product.prices.length > 0,
		);

	const allProducts = [...newProducts, ...patchProducts, ...existingProducts];
	const internalEntityId = fullCustomer.entity?.internal_id;

	if (billingContext.dryRunStripe) {
		const applyPreviewStripeResourcesToCustomerProduct = ({
			customerProduct,
		}: {
			customerProduct: FullCusProduct;
		}) => {
			const product = cusProductToProduct({ cusProduct: customerProduct });
			applyPreviewStripeResourcesToProduct({ product, internalEntityId });
			customerProduct.product.processor = product.processor ?? null;
		};

		for (const customerProduct of insertCustomerProducts) {
			applyPreviewStripeResourcesToCustomerProduct({
				customerProduct,
			});
		}

		for (const patchCustomerProduct of patchCustomerProducts) {
			const matchingCustomerProduct =
				findCustomerProductById({
					fullCustomer,
					customerProductId: patchCustomerProduct.customerProduct.id,
				}) ?? patchCustomerProduct.customerProduct;
			const patchedCustomerProduct = applyCustomerProductPatch({
				customerProduct: matchingCustomerProduct,
				patch: patchCustomerProduct,
			});

			applyPreviewStripeResourcesToCustomerProduct({
				customerProduct: patchedCustomerProduct,
			});

			if (matchingCustomerProduct === patchCustomerProduct.customerProduct) {
				continue;
			}

			applyPreviewStripeResourcesToCustomerProduct({
				customerProduct: applyCustomerProductPatch({
					customerProduct: patchCustomerProduct.customerProduct,
					patch: patchCustomerProduct,
				}),
			});
		}

		for (const customerProduct of fullCustomer.customer_products) {
			if (patchedCustomerProductIds.has(customerProduct.id)) continue;

			applyPreviewStripeResourcesToCustomerProduct({
				customerProduct,
			});
		}

		return;
	}

	const batchProductUpdates = [];
	for (const product of allProducts) {
		if (product.processor?.id != null) continue;
		if (!productNeedsPlanStripeProduct({ product })) continue;

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
				}),
			);
		}
	}
	await Promise.all(batchPriceUpdates);
};
