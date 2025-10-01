import {
	AppEnv,
	BillingInterval,
	ErrCode,
	type Feature,
	Infinite,
	type Organization,
	type UsagePriceConfig,
} from "@autumn/shared";
import Stripe from "stripe";
import { decryptData } from "@/utils/encryptUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export const createStripeCli = ({
	org,
	env,
	// apiVersion,
	legacyVersion,
}: {
	org: Organization;
	env: AppEnv;
	// apiVersion?: string;
	legacyVersion?: boolean;
}) => {
	const encrypted =
		env == AppEnv.Sandbox
			? org.stripe_config?.test_api_key
			: org.stripe_config?.live_api_key;

	if (!encrypted) {
		throw new RecaseError({
			message: `Please connect your Stripe ${env == AppEnv.Sandbox ? "test" : "live"} secret key. You can find it here: https://dashboard.stripe.com${env == AppEnv.Sandbox ? "/test" : ""}/apikeys`,
			code: ErrCode.StripeConfigNotFound,
			statusCode: 400,
		});
	}

	const decrypted = decryptData(encrypted);
	return new Stripe(decrypted, {
		apiVersion: legacyVersion
			? ("2025-02-24.acacia" as any)
			: "2025-07-30.basil",
	});
};

export const calculateMetered1Price = ({
	product,
	numEvents,
	metered1Feature,
}: {
	product: any;
	numEvents: number;
	metered1Feature: Feature;
}) => {
	const allowance = product.entitlements.metered1.allowance;
	const usagePrice = product.prices.find(
		(p: any) => p.config.feature_id === metered1Feature.id,
	);

	const usageConfig = usagePrice.config as UsagePriceConfig;
	let usage = numEvents - allowance;

	let totalPrice = 0;
	// console.log("Usage: ", usage);

	for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
		const tier = usageConfig.usage_tiers[i];

		let amtUsed;
		if (tier.to == -1 || tier.to == Infinite) {
			amtUsed = usage;
		} else {
			amtUsed = Math.min(usage, tier.to);
		}
		const price = tier.amount * (amtUsed / (usageConfig.billing_units ?? 1));
		totalPrice += price;
		usage -= amtUsed;
	}

	return totalPrice;
};

export const subToAutumnInterval = (sub: Stripe.Subscription) => {
	const recuringItem = sub.items.data.find((i) => i.price.recurring != null);
	if (!recuringItem) {
		return {
			interval: BillingInterval.OneOff,
			intervalCount: 1,
		};
	}

	return {
		interval: recuringItem.price.recurring!.interval as BillingInterval,
		intervalCount: recuringItem.price.recurring!.interval_count || 1,
	};
	// return stripeToAutumnInterval({
	//   interval: recuringItem.price.recurring!.interval,
	//   intervalCount: recuringItem.price.recurring!.interval_count,
	// });
};

// export const stripeToAutumnInterval = ({
//   interval,
//   intervalCount,
// }: {
//   interval: string;
//   intervalCount: number;
// }) => {
//   if (interval === "month" && intervalCount === 1) {
//     return BillingInterval.Month;
//   }

//   // if (interval === "month" && intervalCount === 3) {
//   //   return BillingInterval.Quarter;
//   // }

//   // if (interval === "month" && intervalCount === 6) {
//   //   return BillingInterval.SemiAnnual;
//   // }

//   if (
//     (interval === "month" && intervalCount === 12) ||
//     (interval === "year" && intervalCount === 1)
//   ) {
//     return BillingInterval.Year;
//   }
// };
export const subItemToAutumnInterval = (item: Stripe.SubscriptionItem) => {
	return {
		interval: item.price.recurring?.interval as BillingInterval,
		intervalCount: item.price.recurring?.interval_count || 1,
	};
	// return stripeToAutumnInterval({
	//   interval: item.price.recurring?.interval!,
	//   intervalCount: item.price.recurring?.interval_count!,
	// });
};
