import {
	type BillingInterval,
	CusProductStatus,
	type Feature,
	type FullCusProduct,
	type Organization,
	ProrationBehavior,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
// import { ProrationBehavior } from "@/internal/customers/change-product/handleUpgrade.js";
import { SubService } from "@server/internal/subscriptions/SubService.js";
import { differenceInSeconds } from "date-fns";
import type Stripe from "stripe";
import {
	getEarliestPeriodEnd,
	getLatestPeriodEnd,
} from "./stripeSubUtils/convertSubUtils.js";

export const getFullStripeSub = async ({
	stripeCli,
	stripeId,
}: {
	stripeCli: Stripe;
	stripeId: string;
}) => {
	return await stripeCli.subscriptions.retrieve(stripeId);
};

export const getStripeSubs = async ({
	stripeCli,
	subIds,
	expand,
}: {
	stripeCli: Stripe;
	subIds?: string[] | null;
	expand?: string[];
}) => {
	if (!subIds) {
		return [];
	}
	const batchGet = [];
	const getStripeSub = async (subId: string) => {
		try {
			return await stripeCli.subscriptions.retrieve(subId, {
				expand: expand || undefined,
			});
		} catch (error: any) {
			console.log(
				`(warning) getStripeSubs: Failed to get sub ${subId}`,
				error.message,
			);
			return null;
		}
	};

	const uniqueSubIds = Array.from(new Set(subIds));
	for (const subId of uniqueSubIds) {
		batchGet.push(getStripeSub(subId));
	}

	let subs = await PromisStripeSubscriptionCancelede.all(batchGet);
	subs = subs.filter((sub) => sub !== null);

	// Sort by current_period_end (latest first)
	subs.sort((a, b) => {
		if (!a || !b) {
			return 0;
		}

		const aLatestPeriodEnd = getLatestPeriodEnd({ sub: a });
		const bLatestPeriodEnd = getLatestPeriodEnd({ sub: b });
		return bLatestPeriodEnd - aLatestPeriodEnd;
	});

	return subs as Stripe.Subscription[];
};

export const stripeToAutumnSubStatus = (stripeSubStatus: string) => {
	switch (stripeSubStatus) {
		case "trialing":
			return CusProductStatus.Active;
		case "active":
			return CusProductStatus.Active;
		case "past_due":
			return CusProductStatus.PastDue;
		case "incomplete":
			return CusProductStatus.PastDue;

		default:
			return stripeSubStatus;
	}
};

export const deleteScheduledIds = async ({
	stripeCli,
	scheduledIds,
}: {
	stripeCli: Stripe;
	scheduledIds: string[];
}) => {
	for (const scheduledId of scheduledIds) {
		try {
			await stripeCli.subscriptionSchedules.cancel(scheduledId);
		} catch (error: any) {
			console.log("Error deleting scheduled id.", error.message);
		}
	}
};

// Get in advance sub
export const getUsageBasedSub = async ({
	db,
	stripeCli,
	subIds,
	feature,
	stripeSubs,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	subIds: string[];
	feature: Feature;
	stripeSubs?: Stripe.Subscription[];
}) => {
	let subs;
	if (stripeSubs) {
		subs = stripeSubs;
	} else {
		subs = await getStripeSubs({
			stripeCli,
			subIds,
		});
	}

	const finalSubIds = subs.map((sub) => sub.id);

	const autumnSubs = await SubService.getInStripeIds({
		db,
		ids: finalSubIds,
	});

	for (const stripeSub of subs) {
		let usageFeatures: string[] | null = null;

		// 1. Check if there's autumn sub
		const autumnSub = autumnSubs?.find((sub) => sub.stripe_id === stripeSub.id);
		if (autumnSub) {
			const containsFeature = autumnSub.usage_features.includes(
				feature.internal_id!,
			);
			if (containsFeature) {
				return stripeSub;
			}
		}

		try {
			usageFeatures = JSON.parse(stripeSub.metadata.usage_features);
		} catch {
			continue;
		}

		if (
			!usageFeatures ||
			usageFeatures.find(
				(feat: any) => feat.internal_id === feature.internal_id,
			) === undefined
		) {
			continue;
		}

		return stripeSub;
	}

	return null;
};

export const getSubItemsForCusProduct = async ({
	stripeSub,
	cusProduct,
}: {
	stripeSub: Stripe.Subscription;
	cusProduct: FullCusProduct;
}) => {
	const prices = cusProduct.customer_prices.map((cp) => cp.price);
	const product = cusProduct.product;

	const subItems: Stripe.SubscriptionItem[] = [];
	for (const item of stripeSub.items.data) {
		if (item.price.product === product.processor?.id) {
			subItems.push(item);
		} else if (
			prices.some(
				(p) =>
					p.config.stripe_price_id === item.price.id ||
					p.config.stripe_product_id === item.price.product,
			)
		) {
			subItems.push(item);
		}
	}
	const otherSubItems = stripeSub.items.data.filter(
		(item) => !subItems.some((i) => i.id === item.id),
	);

	return { subItems, otherSubItems };
};

export const getStripeSchedules = async ({
	stripeCli,
	scheduleIds,
}: {
	stripeCli: Stripe;
	scheduleIds: string[];
}) => {
	const batchGet = [];
	const getStripeSchedule = async (scheduleId: string) => {
		try {
			const schedule = await stripeCli.subscriptionSchedules.retrieve(
				scheduleId,
				{
					expand: ["phases.items.price"],
				},
			);

			if (schedule.status === "canceled") {
				return null;
			}

			const batchPricesGet = [];
			for (const item of schedule.phases[0].items) {
				batchPricesGet.push(
					stripeCli.prices.retrieve((item.price as Stripe.Price).id as string),
				);
			}
			const prices = await Promise.all(batchPricesGet);
			const interval = prices[0].recurring?.interval;
			// const billingInterval = stripeToAutumnInterval({
			//   interval: prices[0].recurring?.interval as string,
			//   intervalCount: prices[0].recurring?.interval_count || 1,
			// });

			return {
				schedule,
				interval: interval as BillingInterval,
				intervalCount: prices[0].recurring?.interval_count || 1,
				prices,
			};
		} catch (error: any) {
			console.log("Error getting stripe schedule.", error.message);
			return null;
		}
	};

	for (const scheduleId of scheduleIds) {
		batchGet.push(getStripeSchedule(scheduleId));
	}

	const schedulesAndSubs = await Promise.all(batchGet);

	return schedulesAndSubs.filter((schedule) => schedule !== null) as {
		schedule: Stripe.SubscriptionSchedule;
		interval: BillingInterval;
		intervalCount: number;
		prices: Stripe.Price[];
	}[];
};

// OTHERS
export const subIsPrematurelyCanceled = (sub: Stripe.Subscription) => {
	if (sub.cancel_at_period_end) {
		return false;
	}

	const periodEnd = getEarliestPeriodEnd({ sub });

	return differenceInSeconds(periodEnd * 1000, sub.cancel_at! * 1000) > 20;
};

export const autumnToStripeProrationBehavior = ({
	prorationBehavior,
}: {
	prorationBehavior: ProrationBehavior;
}) => {
	switch (prorationBehavior) {
		case ProrationBehavior.Immediately:
			return "always_invoice";
		case ProrationBehavior.NextBilling:
			return "create_prorations";
		case ProrationBehavior.None:
			return "none";
	}
};

export const getStripeProrationBehavior = ({
	org,
	prorationBehavior,
}: {
	org: Organization;
	prorationBehavior?: ProrationBehavior;
}) => {
	const behaviourMap = {
		[ProrationBehavior.Immediately]: "always_invoice",
		[ProrationBehavior.NextBilling]: "create_prorations",
		[ProrationBehavior.None]: "none",
	};

	if (prorationBehavior) {
		return behaviourMap[prorationBehavior];
	}

	return org.config.bill_upgrade_immediately
		? behaviourMap[ProrationBehavior.Immediately]
		: behaviourMap[ProrationBehavior.NextBilling];
};
