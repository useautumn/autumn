import {
	type AppEnv,
	type CreateReward,
	DiscountConfigSchema,
	ErrCode,
	type Organization,
	type Price,
	type Product,
	type Reward,
	RewardCategory,
	RewardType,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId, getUnique, nullish } from "@/utils/genUtils.js";
import { ProductService } from "../products/ProductService.js";
import { isFixedPrice } from "../products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { initProductInStripe } from "../products/productUtils.js";

export const constructReward = ({
	internalId,
	reward,
	orgId,
	env,
}: {
	internalId?: string;
	reward: CreateReward;
	orgId: string;
	env: string;
}) => {
	if (!reward.id || !reward.name) {
		throw new RecaseError({
			message: "Reward ID and name are required",
			code: ErrCode.InvalidReward,
		});
	}

	if (reward.type === RewardType.FreeProduct && !reward.free_product_id) {
		throw new RecaseError({
			message: "Select a free product",
			code: ErrCode.InvalidReward,
		});
	}

	if (getRewardCat(reward as Reward) === RewardCategory.Discount) {
		DiscountConfigSchema.parse(reward.discount_config);
	}

	const promoCodes = reward.promo_codes.filter((promoCode) => {
		return promoCode.code.length > 0;
	});

	let configData = {};
	if (reward.type === RewardType.FreeProduct) {
		configData = {
			free_product_id: reward.free_product_id,
			discount_config: null,
		};
	} else if (reward.type === RewardType.PercentageDiscount) {
		configData = {
			discount_config: reward.discount_config,
			free_product_id: null,
		};
	}

	const newReward = {
		...reward,
		...configData,
		internal_id: internalId || generateId("rew"),
		created_at: Date.now(),
		org_id: orgId,
		env,
		promo_codes: promoCodes,
	};

	return newReward as Reward;
};

export const getRewardCat = (reward: Reward) => {
	if (reward.type === RewardType.FreeProduct) {
		return RewardCategory.FreeProduct;
	}
	return RewardCategory.Discount;
};

export enum CouponType {
	AddInvoiceBalance = "add_invoice_balance",
	AddBillingCredits = "add_billing_credits",
	Standard = "standard",
}

export const getCouponType = (reward: Reward) => {
	if (!reward) return null;

	const config = reward.discount_config;
	if (nullish(config)) {
		return null;
	}

	if (config!.apply_to_all && config!.should_rollover) {
		return CouponType.AddInvoiceBalance;
	} else if (config!.should_rollover) {
		return CouponType.AddBillingCredits;
	}
	return CouponType.Standard;
};

export const getOriginalCouponId = (couponId: string) => {
	if (!couponId) return null;
	const index = couponId.indexOf("_roll_");
	if (index !== -1) {
		return couponId.substring(0, index);
	}
	return couponId;
};

export const initRewardStripePrices = async ({
	db,
	prices,
	org,
	env,
	logger,
}: {
	db: DrizzleCli;
	prices: (Price & { product: Product })[];
	org: Organization;
	env: AppEnv;
	logger: any;
}) => {
	const pricesToInit = prices.map((p: Price) =>
		nullish(p.config.stripe_price_id),
	);

	if (pricesToInit.length === 0) {
		return;
	}

	const internalProductIds = getUnique(
		prices.map((p: Price) => p.internal_product_id),
	);
	const products = await ProductService.listByInternalIds({
		db,
		internalIds: internalProductIds,
	});

	const batchInit: Promise<void>[] = [];
	for (const product of products) {
		batchInit.push(
			initProductInStripe({
				db,
				product,
				org,
				env,
				logger,
			}),
		);
	}
	await Promise.all(batchInit);

	for (const price of prices) {
		const product = products.find(
			(p) => p.internal_id === price.internal_product_id,
		);

		price.product = product as Product;
	}
	return;
};

export const formatReward = ({ reward }: { reward: Reward }) => {
	if (!reward) return "";
	const discountString =
		reward.type === RewardType.PercentageDiscount
			? `${reward.discount_config?.discount_value}%`
			: `${reward.discount_config?.discount_value} off`;

	if (reward.discount_config?.apply_to_all) {
		return `${discountString} off all products`;
	} else if (reward.discount_config?.price_ids) {
		return `${discountString} off prices: ${reward.discount_config?.price_ids.join(", ")}`;
	}

	return discountString;
};

export const getAmountAfterReward = ({
	amount,
	reward,
	subDiscounts,
	currency,
}: {
	amount: number;
	reward: Reward;
	subDiscounts: Stripe.Discount[];
	currency?: string;
}) => {
	if (
		subDiscounts.find(
			(d) =>
				d.source.coupon &&
				typeof d.source.coupon !== "string" &&
				d.source.coupon.id === reward.id,
		)
	) {
		return amount;
	}

	if (reward.type === RewardType.PercentageDiscount) {
		const discountValue = new Decimal(
			reward.discount_config?.discount_value ?? 0,
		);

		const atmnDiscountValue = stripeToAtmnAmount({
			amount: discountValue.toNumber(),
			currency,
		});

		const discountRatio = new Decimal(1).minus(atmnDiscountValue);

		return new Decimal(amount).mul(discountRatio).toNumber();
	} else if (reward.type === RewardType.FixedDiscount) {
		const discountAmount = new Decimal(
			reward.discount_config?.discount_value ?? 0,
		);
		return new Decimal(amount).minus(discountAmount).toNumber();
	}
	return amount;
};

export const discountAppliesToPrice = ({
	discount,
	product,
	price,
}: {
	discount: Stripe.Discount;
	product: Product;
	price: Price;
}) => {
	const coupon = discount.source.coupon;
	if (!coupon || typeof coupon === "string") {
		return true;
	}

	const appliesTo = coupon.applies_to?.products;

	if (nullish(appliesTo)) return true;

	if (isFixedPrice({ price })) {
		return appliesTo!.some(
			(stripeProdId) => stripeProdId === product.processor?.id,
		);
	}

	return appliesTo!.some(
		(stripeProdId) => stripeProdId === price.config.stripe_product_id,
	);
};

export const getUnusedAmountAfterDiscount = ({
	amount,
	discountAmounts,
	ratio,
}: {
	amount: number;
	discountAmounts: any[];
	ratio: number;
}) => {
	let amountAfterDiscount = Math.abs(amount);

	for (const discountAmount of discountAmounts) {
		const appliedDiscount = new Decimal(discountAmount.amount || 0)
			.div(100)
			.mul(ratio);

		amountAfterDiscount = new Decimal(amountAfterDiscount)
			.minus(appliedDiscount)
			.toNumber();
	}
	return amountAfterDiscount;
};

export const getAmountAfterStripeDiscounts = ({
	price,
	amount,
	product,
	stripeDiscounts,
	currency,
}: {
	price: Price;
	product: Product;
	amount: number;
	stripeDiscounts: Stripe.Discount[];
	currency?: string;
}) => {
	let amountAfterDiscount = amount;

	for (const discount of stripeDiscounts) {
		if (!discountAppliesToPrice({ discount, product, price })) continue;

		const coupon = discount.source.coupon;
		if (!coupon || typeof coupon === "string") {
			continue;
		}

		if (coupon.percent_off) {
			const ratio = new Decimal(1).minus(
				new Decimal(coupon.percent_off).div(100),
			);
			amountAfterDiscount = new Decimal(amountAfterDiscount)
				.mul(ratio)
				.toNumber();
		} else if (coupon.amount_off) {
			// must do some ratio ting here...
			const atmnDiscountAmount = stripeToAtmnAmount({
				amount: coupon.amount_off,
				currency: currency,
			});

			amountAfterDiscount = new Decimal(amountAfterDiscount)
				.minus(atmnDiscountAmount)
				.toNumber();
		}
	}
	return amountAfterDiscount;
};
