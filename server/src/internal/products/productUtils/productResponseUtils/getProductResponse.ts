import {
  AttachScenario,
  BillingInterval,
  type Feature,
  type FeatureOptions, type FreeTrialResponse,
  FreeTrialResponseSchema,
  type FullCustomer,
  type FullProduct,
  type Price,
  type ProductItem,
  ProductItemResponseSchema,
  ProductPropertiesSchema,
  ProductResponseSchema,
  UsageModel
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { toAPIFeature } from "@/internal/features/utils/mapFeatureUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { getFreeTrialAfterFingerprint } from "../../free-trials/freeTrialUtils.js";
import { sortProductItems } from "../../pricecn/pricecnUtils.js";
import { getLargestInterval } from "../../prices/priceUtils/priceIntervalUtils.js";
import { isPrepaidPrice } from "../../prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getItemType } from "../../product-items/productItemUtils/getItemType.js";
import { itemToPriceOrTiers } from "../../product-items/productItemUtils.js";
import { isFreeProduct, isOneOff } from "../../productUtils.js";
import { mapToProductItems } from "../../productV2Utils.js";
import { getAttachScenario } from "./getAttachScenario.js";
import { getProductItemDisplay } from "./getProductItemDisplay.js";

export const getProductItemResponse = ({
	item,
	features,
	currency,
	withDisplay = true,
	options,
	isMainPrice = false,
}: {
	item: ProductItem;
	features: Feature[];
	currency?: string | null;
	withDisplay?: boolean;
	options?: FeatureOptions[];
	isMainPrice?: boolean;
}) => {
	// 1. Get item type
	const type = getItemType(item);

	// 2. Get display
	const display = getProductItemDisplay({
		item,
		features,
		currency,
		isMainPrice,
	});

	const priceData = itemToPriceOrTiers({ item });

	let quantity: number | undefined;
	let upcomingQuantity: number | undefined;

	if (item.usage_model === UsageModel.Prepaid && notNullish(options)) {
		const option = options!.find((o) => o.feature_id === item.feature_id);
		quantity = option?.quantity
			? option?.quantity * (item.billing_units ?? 1)
			: undefined;

		upcomingQuantity = option?.upcoming_quantity
			? option?.upcoming_quantity * (item.billing_units ?? 1)
			: undefined;
	}

	const feature = features.find((f) => f.id === item.feature_id);
	return ProductItemResponseSchema.parse({
		type,
		...item,
		feature: feature ? toAPIFeature({ feature }) : null,
		display: withDisplay ? display : undefined,
		...priceData,
		quantity,
		next_cycle_quantity: upcomingQuantity,
	});
};

export const getFreeTrialResponse = async ({
	db,
	product,
	fullCus,
	attachScenario,
}: {
	db?: DrizzleCli;
	product: FullProduct;
	fullCus?: FullCustomer;
	attachScenario: AttachScenario;
}) => {
	if (!db) return product.free_trial;

	if (product.free_trial && fullCus) {
		let trial = await getFreeTrialAfterFingerprint({
			db,
			freeTrial: product.free_trial,
			fingerprint: fullCus.fingerprint,
			internalCustomerId: fullCus.internal_id,
			multipleAllowed: false,
			productId: product.id,
		});

		if (attachScenario === AttachScenario.Downgrade) trial = null;
		return FreeTrialResponseSchema.parse({
			duration: product.free_trial?.duration,
			length: product.free_trial?.length,
			unique_fingerprint: product.free_trial?.unique_fingerprint,
			trial_available: notNullish(trial) ? true : false,
		});
	}

	if (product.free_trial) {
		return FreeTrialResponseSchema.parse({
			duration: product.free_trial?.duration,
			length: product.free_trial?.length,
			unique_fingerprint: product.free_trial?.unique_fingerprint,
		});
	}

	return null;
};

export const getProductProperties = ({
	product,
	freeTrial,
}: {
	product: FullProduct;
	freeTrial?: FreeTrialResponse | null;
}) => {
	const largestInterval = getLargestInterval({
		prices: product.prices,
		excludeOneOff: true,
	});

	const hasFreeTrial =
		notNullish(freeTrial) && freeTrial?.trial_available !== false;

	return ProductPropertiesSchema.parse({
		is_free: isFreeProduct(product.prices) || false,
		is_one_off: isOneOff(product.prices) || false,
		interval_group: largestInterval?.interval,
		has_trial: hasFreeTrial,
		updateable: product.prices.some(
			(p: Price) =>
				isPrepaidPrice({ price: p }) &&
				p.config.interval !== BillingInterval.OneOff,
		),
	});
};

export const getProductResponse = async ({
	product,
	features,
	fullCus,
	currency,
	db,
	withDisplay = true,
	options,
}: {
	product: FullProduct;
	features: Feature[];
	fullCus?: FullCustomer;
	currency?: string | null;
	db?: DrizzleCli;
	withDisplay?: boolean;
	options?: FeatureOptions[];
}) => {
	// 1. Get items with display
	const rawItems = mapToProductItems({
		prices: product.prices,
		entitlements: product.entitlements,
		features: features,
	});

	// Sort raw items first
	const sortedItems = sortProductItems(rawItems, features);

	// Transform sorted items
	const items = sortedItems.map((item, index) => {
		return getProductItemResponse({
			item,
			features,
			currency,
			withDisplay,
			options,
			isMainPrice: index === 0,
		});
	});

	// 2. Get product properties
	const attachScenario = getAttachScenario({
		fullCus,
		fullProduct: product,
	});

	const freeTrial = (await getFreeTrialResponse({
		db: db as DrizzleCli,
		product,
		fullCus,
		attachScenario,
	})) as FreeTrialResponse;

	return ProductResponseSchema.parse({
		...product,
		name: product.name || null,
		group: product.group || null,
		items: items,
		free_trial: freeTrial || null,
		scenario: attachScenario,
		properties: getProductProperties({ product, freeTrial }),
		archived: product.archived ? true : undefined,
	});
};
