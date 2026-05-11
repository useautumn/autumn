import {
	type FullProduct,
	InternalError,
	isPrepaidPrice,
	type Price,
	ProcessorType,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import { hashJson } from "@/utils/hash/hashJson";

export const PREVIEW_STRIPE_PRICE_ID_PREFIX = "price_PREVIEW_";
export const PREVIEW_STRIPE_PRODUCT_ID_PREFIX = "prod_PREVIEW_";

const previewHash = ({ value }: { value: unknown }) =>
	hashJson({ value }).slice(0, 24);

export const isPreviewStripeId = ({ stripeId }: { stripeId?: string | null }) =>
	stripeId?.startsWith(PREVIEW_STRIPE_PRICE_ID_PREFIX) === true ||
	stripeId?.startsWith(PREVIEW_STRIPE_PRODUCT_ID_PREFIX) === true;

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
}: {
	product: FullProduct;
	internalEntityId?: string;
}) => {
	const productProcessorId =
		product.processor?.id ?? previewStripeProductIdForProduct({ product });

	product.processor = {
		id: productProcessorId,
		type: ProcessorType.Stripe,
	};

	for (const price of product.prices) {
		const config = price.config as Partial<UsagePriceConfig>;

		config.stripe_price_id ??= previewStripePriceIdForPrice({
			price,
			product,
			fieldName: "stripe_price_id",
		});

		if ("feature_id" in config && config.feature_id) {
			config.stripe_product_id ??= previewStripeProductIdForPrice({
				price,
				product,
				internalEntityId,
			});
		}

		if (isPrepaidPrice(price)) {
			config.stripe_prepaid_price_v2_id ??= previewStripePriceIdForPrice({
				price,
				product,
				fieldName: "stripe_prepaid_price_v2_id",
			});
		}
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
