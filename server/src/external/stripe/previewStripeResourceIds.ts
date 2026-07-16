import {
	type AutumnBillingPlan,
	type BillingContext,
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	findCustomerProductById,
	getPriceCurrencyStripeId,
	InternalError,
	isPrepaidPrice,
	isPreviewStripeId,
	isUsagePrice,
	PREVIEW_STRIPE_PRICE_ID_PREFIX,
	PREVIEW_STRIPE_PRODUCT_ID_PREFIX,
	type Price,
	ProcessorType,
	type Product,
	setPriceCurrencyStripeId,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	applyCustomerProductPatch,
	getPatchCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { hashJson } from "@/utils/hash/hashJson";

const previewHash = ({ value }: { value: unknown }) =>
	hashJson({ value }).slice(0, 24);

export const assertNotPreviewStripeId = ({
	stripeId,
	fieldName,
}: {
	stripeId?: string | null;
	fieldName: string;
}) => {
	if (!isPreviewStripeId({ stripeId })) return;

	throw new InternalError({
		message: `Refusing to persist preview Stripe id in ${fieldName}`,
	});
};

export const previewStripeProductIdForProduct = ({
	product,
}: {
	product: Product;
}) =>
	`${PREVIEW_STRIPE_PRODUCT_ID_PREFIX}${previewHash({
		value: {
			env: product.env,
			internalProductId: product.internal_id,
			productId: product.id,
		},
	})}`;

const previewStripeProductIdForPrice = ({
	price,
	product,
	internalEntityId,
}: {
	price: Price;
	product: Product;
	internalEntityId?: string;
}) => {
	const config = price.config as Partial<UsagePriceConfig>;
	return `${PREVIEW_STRIPE_PRODUCT_ID_PREFIX}${previewHash({
		value: {
			env: product.env,
			featureId: config.feature_id,
			internalEntityId,
			internalFeatureId: config.internal_feature_id,
			internalProductId: product.internal_id,
			productId: product.id,
		},
	})}`;
};

const previewStripePriceIdForPrice = ({
	price,
	product,
	fieldName,
}: {
	price: Price;
	product: Product;
	fieldName: string;
}) =>
	`${PREVIEW_STRIPE_PRICE_ID_PREFIX}${previewHash({
		value: {
			config: price.config,
			fieldName,
			internalProductId: product.internal_id,
		},
	})}`;

export const applyPreviewStripeResourcesToProduct = ({
	product,
	internalEntityId,
	currency,
	orgDefault,
}: {
	product: FullProduct;
	internalEntityId?: string;
	currency: string;
	orgDefault: string;
}) => {
	const productProcessorId =
		product.processor?.id ?? previewStripeProductIdForProduct({ product });

	product.processor = {
		id: productProcessorId,
		type: ProcessorType.Stripe,
	};

	for (const price of product.prices) {
		const config = price.config as Partial<UsagePriceConfig>;

		// Stub the id for the resolved currency's slot (base or currencies[ccy]),
		// so preview of a not-yet-created A-prime price doesn't fail item-spec build.
		if (
			!getPriceCurrencyStripeId({
				config: price.config,
				currency,
				orgDefault,
				slot: "stripe_price_id",
			})
		) {
			setPriceCurrencyStripeId({
				config: price.config,
				currency,
				orgDefault,
				slot: "stripe_price_id",
				id: previewStripePriceIdForPrice({
					price,
					product,
					fieldName: "stripe_price_id",
				}),
			});
		}

		if (isUsagePrice({ price })) {
			config.stripe_product_id ??= previewStripeProductIdForPrice({
				price,
				product,
				internalEntityId,
			});
		}

		if (
			isPrepaidPrice(price) &&
			!getPriceCurrencyStripeId({
				config: price.config,
				currency,
				orgDefault,
				slot: "stripe_prepaid_price_v2_id",
			})
		) {
			setPriceCurrencyStripeId({
				config: price.config,
				currency,
				orgDefault,
				slot: "stripe_prepaid_price_v2_id",
				id: previewStripePriceIdForPrice({
					price,
					product,
					fieldName: "stripe_prepaid_price_v2_id",
				}),
			});
		}
	}
};

const applyPreviewStripeResourcesToCustomerProduct = ({
	customerProduct,
	internalEntityId,
	currency,
	orgDefault,
}: {
	customerProduct: FullCusProduct;
	internalEntityId?: string;
	currency: string;
	orgDefault: string;
}) => {
	const product = cusProductToProduct({ cusProduct: customerProduct });
	applyPreviewStripeResourcesToProduct({
		product,
		internalEntityId,
		currency,
		orgDefault,
	});
	customerProduct.product.processor = product.processor ?? null;
};

/** Stamp preview Stripe IDs onto every customer product touched by a dry-run billing plan. */
export const applyPreviewStripeResourcesToBillingPlan = ({
	autumnBillingPlan,
	billingContext,
	currency,
	orgDefault,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
	currency: string;
	orgDefault: string;
}) => {
	const { fullCustomer } = billingContext;
	const internalEntityId = fullCustomer.entity?.internal_id;
	const patchCustomerProducts = getPatchCustomerProducts({ autumnBillingPlan });
	const patchedCustomerProductIds = new Set(
		patchCustomerProducts.map(
			(patchCustomerProduct) => patchCustomerProduct.customerProduct.id,
		),
	);

	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		applyPreviewStripeResourcesToCustomerProduct({
			customerProduct,
			internalEntityId,
			currency,
			orgDefault,
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
			internalEntityId,
			currency,
			orgDefault,
		});

		if (matchingCustomerProduct === patchCustomerProduct.customerProduct) {
			continue;
		}

		applyPreviewStripeResourcesToCustomerProduct({
			customerProduct: applyCustomerProductPatch({
				customerProduct: patchCustomerProduct.customerProduct,
				patch: patchCustomerProduct,
			}),
			internalEntityId,
			currency,
			orgDefault,
		});
	}

	for (const customerProduct of fullCustomer.customer_products) {
		if (patchedCustomerProductIds.has(customerProduct.id)) continue;

		applyPreviewStripeResourcesToCustomerProduct({
			customerProduct,
			internalEntityId,
			currency,
			orgDefault,
		});
	}

	const licenseProductsByDefinition = new Map<string, FullProduct>();
	for (const customerProduct of [
		...autumnBillingPlan.insertCustomerProducts,
		...fullCustomer.customer_products,
	]) {
		for (const customerLicense of customerProduct.customer_licenses ?? []) {
			const licenseProduct = customerLicense.planLicense?.product;
			if (!licenseProduct) continue;
			licenseProductsByDefinition.set(
				customerLicense.plan_license_id ?? licenseProduct.internal_id,
				licenseProduct,
			);
		}
	}

	for (const transition of autumnBillingPlan.customerLicenseTransitions ?? []) {
		const planLicense = transition.incomingCustomerLicense.planLicense;
		if (!planLicense) continue;
		licenseProductsByDefinition.set(planLicense.id, planLicense.product);
	}

	for (const licenseProduct of licenseProductsByDefinition.values()) {
		applyPreviewStripeResourcesToProduct({
			product: licenseProduct,
			internalEntityId,
			currency,
			orgDefault,
		});
	}
};

export const assertNoPreviewStripeIdsOnProduct = ({
	product,
}: {
	product: FullProduct;
}) => {
	assertNotPreviewStripeId({
		stripeId: product.processor?.id,
		fieldName: "product.processor.id",
	});

	for (const price of product.prices) {
		const config = price.config as Partial<UsagePriceConfig>;
		for (const fieldName of [
			"stripe_price_id",
			"stripe_product_id",
			"stripe_empty_price_id",
			"stripe_placeholder_price_id",
			"stripe_prepaid_price_v2_id",
		] as const) {
			assertNotPreviewStripeId({
				stripeId: config[fieldName],
				fieldName: `price.config.${fieldName}`,
			});
		}
	}
};
