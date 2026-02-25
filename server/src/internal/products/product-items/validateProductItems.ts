import {
	type AppEnv,
	EntInterval,
	ErrCode,
	type Feature,
	FeatureType,
	Infinite,
	itemToEntInterval,
	notNullish,
	nullish,
	OnIncrease,
	type ProductItem,
	ProductItemInterval,
	ProductItemSchema,
	RecaseError,
	type RolloverConfig,
	RolloverExpiryDurationType,
	UsageModel,
} from "@autumn/shared";
import { createFeaturesFromItems } from "@server/internal/products/product-items/createFeaturesFromItems";

import { StatusCodes } from "http-status-codes";
import {
	isBooleanFeatureItem,
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./productItemUtils/getItemType";

const validateProductItem = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	item = ProductItemSchema.parse(item);
	const feature = features.find((f) => f.id === item.feature_id);

	if (nullish(item.feature_id) && nullish(item.price) && nullish(item.tiers)) {
		throw new RecaseError({
			message: `Either 'feature_id', 'price', or both should be set`,
			code: ErrCode.InvalidProductItem,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// 1. Check if amount and tiers are not null
	if (notNullish(item.price) && notNullish(item.tiers)) {
		throw new RecaseError({
			message: `Either 'price' or 'tiers' should be set, not both`,
			code: ErrCode.InvalidProductItem,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// 2. If amount is set, it must be greater than 0
	if (notNullish(item.price) && item.price <= 0) {
		throw new RecaseError({
			message: `Price must be greater than 0`,
			code: ErrCode.InvalidProductItem,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// 4. One off prices / fixed prices can have at most 2 decimal places
	// (isFeaturePriceItem(item) && !item.interval && isOneOff) ||
	if (isPriceItem(item)) {
		// One off price..., can't have more than 2 DP
		if (item.price && item.price.toString().split(".")[1]?.length > 2) {
			throw new RecaseError({
				message: `One off prices can have at most 2 decimal places`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	// 4. If it's a feature item, it should have included usage as number or inf
	if (isFeaturePriceItem(item) || isFeatureItem(item)) {
		if (
			typeof item.included_usage !== "number" &&
			item.included_usage !== Infinite &&
			notNullish(item.included_usage)
		) {
			throw new RecaseError({
				message: `Included usage for feature ${item.feature_id} must be a number or '${Infinite}'`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (nullish(item.included_usage)) {
			item.included_usage = 0;
		}

		// 4a. Check if included usage is negative
		if (typeof item.included_usage === "number" && item.included_usage < 0) {
			throw new RecaseError({
				message: `Included usage must be 0 or greater`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	// if (isFeatureItem(item)) {
	// 	if (item.included_usage === 0 && feature?.type !== FeatureType.Boolean) {
	// 		throw new RecaseError({
	// 			message: `Included usage for feature ${item.feature_id} must be greater than 0`,
	// 			code: ErrCode.InvalidInputs,
	// 			statusCode: StatusCodes.BAD_REQUEST,
	// 		});
	// 	}
	// }

	// 5. If it's a price, can't have day, minute or hour interval
	if (isFeaturePriceItem(item) || isPriceItem(item)) {
		if (
			item.interval === ProductItemInterval.Day ||
			item.interval === ProductItemInterval.Minute ||
			item.interval === ProductItemInterval.Hour
		) {
			throw new RecaseError({
				message: `Price can't have day, minute or hour interval`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	if ((isPriceItem(item) || isFeaturePriceItem(item)) && item.price === 0) {
		throw new RecaseError({
			message: `Price must be 0 or greater`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (isFeaturePriceItem(item) && nullish(item.usage_model)) {
		throw new RecaseError({
			message: `Usage model is required for priced features. Please select one for the feature ${item.feature_id}`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (isFeaturePriceItem(item) && item.tiers) {
		if (
			item.tiers.some((x) => {
				return x.amount <= 0;
			})
		) {
			throw new RecaseError({
				message: `Price must be a number and greater than 0 for feature ${item.feature_id}`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (item.included_usage === Infinite) {
			throw new RecaseError({
				message: `Included usage can't be '${Infinite}' for tiered prices`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (item.billing_units && item.billing_units <= 0) {
			throw new RecaseError({
				message: `Billing units must be greater than 0`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	if (
		item.usage_model === UsageModel.Prepaid &&
		item.config?.on_increase === OnIncrease.BillImmediately
	) {
		throw new RecaseError({
			message: `Bill immediately is not supported for prepaid just yet, contact us at hey@useautumn.com if you're interested!`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// Rollover validation
	if (item.config?.rollover) {
		const rollover = item.config.rollover as RolloverConfig;

		// Ensure rollover is only allowed for items with intervals and included usage
		if (
			item.interval === null ||
			nullish(item.included_usage) ||
			item.included_usage === 0
		) {
			throw new RecaseError({
				message:
					"Rollover is only allowed for items with intervals and included usage",
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// Validate rollover max amount
		if (rollover.max !== null && typeof rollover.max === "number") {
			if (rollover.max < 0) {
				throw new RecaseError({
					message: "Rollover maximum amount must be positive",
					code: ErrCode.InvalidInputs,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		// Validate rollover length for monthly durations
		if (rollover.duration === RolloverExpiryDurationType.Month) {
			if (typeof rollover.length !== "number" || rollover.length < 0) {
				throw new RecaseError({
					message:
						"Rollover length must be a positive number for monthly durations",
					code: ErrCode.InvalidInputs,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		// Set length to 0 for forever duration
		if (rollover.duration === RolloverExpiryDurationType.Forever) {
			rollover.length = 0;
		}

		if (notNullish(item.usage_limit) && item.usage_limit <= 0) {
			throw new RecaseError({
				message: `Usage limit must be greater than 0`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};

export const validateProductItems = ({
	newItems,
	features,
	orgId,
	env,
}: {
	newItems: ProductItem[];
	features: Feature[];
	orgId: string;
	env: AppEnv;
}) => {
	const { allFeatures, newFeatures } = createFeaturesFromItems({
		items: newItems,
		curFeatures: features,
		orgId,
		env,
	});

	features = allFeatures;

	// const isOneOff =
	//   newItems.every((item) => {
	//     if (isFeatureItem(item)) return true;
	//     return nullish(item.interval);
	//   }) &&
	//   newItems.some((item) => isFeaturePriceItem(item) || isPriceItem(item));

	// 1. Check values
	for (let index = 0; index < newItems.length; index++) {
		validateProductItem({ item: newItems[index], features });
		const feature = features.find((f) => f.id === newItems[index].feature_id);

		if (feature && feature.type === FeatureType.Metered) {
			newItems[index].feature_type = feature.config?.usage_type;
		}
	}

	for (let index = 0; index < newItems.length; index++) {
		const item = newItems[index];
		const entInterval = itemToEntInterval({ item });
		const intervalCount = item.interval_count || 1;

		if (isFeaturePriceItem(item) && entInterval === EntInterval.Lifetime) {
			const otherItem = newItems.find((i: any, index2: any) => {
				return i.feature_id === item.feature_id && index2 !== index;
			});

			if (otherItem && isFeaturePriceItem(otherItem)) {
				throw new RecaseError({
					message: `If feature is lifetime and paid, can't have any other features`,
					code: ErrCode.InvalidInputs,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		// Boolean duplicate
		if (isBooleanFeatureItem(item)) {
			const otherItem = newItems.find((i: any, index2: any) => {
				return (
					i.feature_id === item.feature_id &&
					index2 !== index &&
					item.entity_feature_id === i.entity_feature_id
				);
			});

			if (otherItem) {
				throw new RecaseError({
					message: `Feature ${item.feature_id} is duplicated`,
					code: ErrCode.InvalidInputs,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		const otherItem = newItems.find((i: any, index2: any) => {
			return (
				i.feature_id === item.feature_id &&
				index2 !== index &&
				itemToEntInterval({ item: i }) === entInterval &&
				(i.interval_count || 1) === intervalCount &&
				i.entity_feature_id === item.entity_feature_id
			);
		});

		if (!otherItem) {
			continue;
		}

		if (isFeatureItem(otherItem) && isFeatureItem(item)) {
			throw new RecaseError({
				message: `You're trying to create two items for the same feature (${item.feature_id}) with the same interval. Please make them into one item.`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (isFeatureItem(otherItem)) {
			throw new RecaseError({
				message: `You have a usage-based price for for this feature (${item.feature_id}). If you're looking to create an overage item (eg. 100 free, then $0.5 thereafter), you should add it to the existing item.`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (item.usage_model && item.usage_model === otherItem?.usage_model) {
			throw new RecaseError({
				message: `You're trying to add the same feature (${item.feature_id}), with the same reset interval. You should either change the reset interval of one of the items, or make one of them a prepaid quantity`,
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (isPriceItem(item)) {
			const otherItem = newItems.find((i: any, index2: any) => {
				return i.interval === item.interval && index2 !== index;
			});

			if (otherItem) {
				throw new RecaseError({
					message: `Can't have two fixed prices with the same interval`,
					code: ErrCode.InvalidInputs,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}
	}

	// 6. Can't have both weekly and monthly price items in the same product
	const hasWeeklyPrice = newItems.some(
		(item) =>
			(isPriceItem(item) || isFeaturePriceItem(item)) &&
			item.interval === ProductItemInterval.Week,
	);
	const hasMonthlyPrice = newItems.some(
		(item) =>
			(isPriceItem(item) || isFeaturePriceItem(item)) &&
			item.interval === ProductItemInterval.Month,
	);

	if (hasWeeklyPrice && hasMonthlyPrice) {
		throw new RecaseError({
			message: `Can't have both weekly and monthly price items in the same product`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (newItems.filter(isPriceItem).length > 1) {
		throw new RecaseError({
			message: `Can't have more than one price item in the same product`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	return { allFeatures, newFeatures };
};
