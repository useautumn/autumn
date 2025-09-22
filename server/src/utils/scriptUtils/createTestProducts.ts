import {
	constructBooleanFeature,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import {
	AppEnv,
	BillingInterval,
	CouponDurationType,
	CreateFreeTrial,
	CreateFreeTrialSchema,
	CreateReward,
	FeatureUsageType,
	FreeTrial,
	FreeTrialDuration,
	ProductItem,
	ProductV2,
	RewardType,
} from "@autumn/shared";
import { keyToTitle } from "../genUtils.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";

export enum TestFeatureType {
	Boolean = "boolean",
	SingleUse = "single_use",
	ContinuousUse = "continuous_use",
}

export const initFeature = ({
	id,
	orgId,
	type,
}: {
	id: string;
	orgId: string;
	type: TestFeatureType;
}) => {
	if (type === TestFeatureType.Boolean) {
		return constructBooleanFeature({
			featureId: id,
			orgId,
			env: AppEnv.Sandbox,
		});
	} else if (type === TestFeatureType.SingleUse) {
		return constructMeteredFeature({
			featureId: id,
			orgId,
			env: AppEnv.Sandbox,
			usageType: FeatureUsageType.Single,
		});
	} else {
		return constructMeteredFeature({
			featureId: id,
			orgId,
			env: AppEnv.Sandbox,
			usageType: FeatureUsageType.Continuous,
		});
	}
};

export const constructRawProduct = ({
	id,
	isAddOn = false,
	items,
}: {
	id: string;
	isAddOn?: boolean;
	items: ProductItem[];
}) => {
	return {
		id,
		name: keyToTitle(id),
		items,
		is_add_on: isAddOn,
		is_default: false,
		version: 1,
		group: "",
		created_at: Date.now(),
	};
};

export const constructProduct = ({
	id,
	items,
	type,
	interval,
	group,
	intervalCount,
	isAnnual = false,
	trial = false,
	excludeBase = false,
	isDefault = true,
	isAddOn = false,
	freeTrial,
	forcePaidDefault = false,
}: {
	id?: string;
	items: ProductItem[];
	type: "free" | "pro" | "premium" | "growth" | "one_off";
	interval?: BillingInterval;
	group?: string;
	intervalCount?: number;
	isAnnual?: boolean;
	trial?: boolean;
	excludeBase?: boolean;
	isDefault?: boolean;
	isAddOn?: boolean;
	freeTrial?: CreateFreeTrial;
	forcePaidDefault?: boolean;
}) => {
	let price = 0;
	if (type == "pro") {
		price = 20;
	} else if (type == "premium") {
		price = 50;
	} else if (type == "growth") {
		price = 100;
	}

	if (price && !excludeBase) {
		items.push(
			constructPriceItem({
				price: isAnnual ? price * 10 : price,
				interval: isAnnual
					? BillingInterval.Year
					: interval
						? interval
						: BillingInterval.Month,
				intervalCount: intervalCount || 1,
			}),
		);
	}

	if (type == "one_off") {
		items.push(
			constructPriceItem({
				price: 10,
				interval: null,
			}),
		);
	}

	let id_ =
		id ||
		(isAnnual ? `${type}-annual` : interval ? `${type}-${interval}` : type);

	let product: ProductV2 = {
		id: id_,
		name: id
			? keyToTitle(id)
			: isAnnual
				? `${keyToTitle(type)} (Annual)`
				: interval
					? `${keyToTitle(type)} (${interval})`
					: keyToTitle(type),
		items,
		is_add_on: isAddOn,
		is_default: (type == "free" && isDefault) || forcePaidDefault,
		version: 1,
		group: group || "",
		free_trial:
			freeTrial || trial
				? (CreateFreeTrialSchema.parse({
						length: 7,
						duration: FreeTrialDuration.Day,
						unique_fingerprint: false,
						card_required: true,
					}) as any)
				: null,
		created_at: Date.now(),
	};

	return product;
};

export const constructCoupon = ({
	id,
	promoCode,
	discountType = RewardType.FixedDiscount,
	discountValue = 10,
}: {
	id: string;
	promoCode: string;
	discountType?: RewardType;
	discountValue?: number;
}) => {
	const reward: CreateReward = {
		id,
		name: keyToTitle(id),
		promo_codes: [{ code: promoCode }],
		type: discountType,
		discount_config: {
			discount_value: discountValue,
			duration_type: CouponDurationType.Forever,
			duration_value: 1,
			should_rollover: true,
			apply_to_all: true,
			price_ids: [],
		},
	};

	return reward;
};
